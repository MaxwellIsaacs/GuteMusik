use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};

use id3::TagLike;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MbArtist {
    pub id: String,
    pub name: String,
    pub disambiguation: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MbAlbum {
    pub id: String,
    pub title: String,
    pub year: String,
    #[serde(rename = "type")]
    pub release_type: String,
    pub secondary_types: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AlbumRequest {
    pub artist: String,
    pub album: String,
    pub year: String,
    pub genre: String,
    pub tracks: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SongRequest {
    pub title: String,
    pub artist: String,
    pub album: String,
    pub year: String,
    pub genre: String,
    pub track_num: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct YtSearchResult {
    pub id: String,
    pub title: String,
    pub duration: String,
    pub channel: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadProgress {
    pub album_index: usize,
    pub total_albums: usize,
    pub artist: String,
    pub album: String,
    pub track_index: usize,
    pub total_tracks: usize,
    pub track_name: String,
    pub status: String,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadState {
    pub is_active: bool,
    pub albums: Vec<AlbumDownloadState>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActiveTrack {
    pub track_index: usize,
    pub track_name: String,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AlbumDownloadState {
    pub artist: String,
    pub album: String,
    pub status: String,
    pub completed_tracks: usize,
    pub total_tracks: usize,
    pub error: Option<String>,
    pub active_tracks: Vec<ActiveTrack>,
}

/// Represents a queued work item for the download worker.
#[derive(Debug, Clone)]
enum QueueItem {
    Album(AlbumRequest),
    Song { song: SongRequest, video_id: String },
}

pub struct DownloaderStateInner {
    pub state: Mutex<DownloadState>,
    pub cancel: Mutex<bool>,
    /// Whether a worker thread is currently running.
    worker_running: Mutex<bool>,
    /// Pending items that haven't been picked up by the worker yet.
    pending_queue: Mutex<Vec<QueueItem>>,
}

#[derive(Clone)]
pub struct DownloaderState(pub Arc<DownloaderStateInner>);

impl Default for DownloaderState {
    fn default() -> Self {
        Self(Arc::new(DownloaderStateInner {
            state: Mutex::new(DownloadState {
                is_active: false,
                albums: vec![],
            }),
            cancel: Mutex::new(false),
            worker_running: Mutex::new(false),
            pending_queue: Mutex::new(vec![]),
        }))
    }
}

const MUSIC_DIR: &str = "/home/max/MUSIC_SERVER/music";
const MB_USER_AGENT: &str = "LuminaMusicPlayer/1.0 (https://github.com/lumina)";

// ────────────────────────────────────────────────────────────────────────────
// yt-dlp / ffmpeg path resolution
// ────────────────────────────────────────────────────────────────────────────

fn find_binary(name: &str) -> String {
    // Try PATH first
    if let Ok(output) = Command::new("which").arg(name).output() {
        if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !path.is_empty() {
                return path;
            }
        }
    }

    // Search common nix store locations
    if let Ok(output) = Command::new("bash")
        .args(["-c", &format!(
            "find /nix/store -maxdepth 3 -name '{}' -type f 2>/dev/null | head -1", name
        )])
        .output()
    {
        if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !path.is_empty() {
                return path;
            }
        }
    }

    // Fallback: hope it's on PATH at runtime
    name.to_string()
}

fn yt_dlp_path() -> String {
    use std::sync::OnceLock;
    static PATH: OnceLock<String> = OnceLock::new();
    PATH.get_or_init(|| find_binary("yt-dlp")).clone()
}

fn ffmpeg_dir() -> Option<String> {
    use std::sync::OnceLock;
    static DIR: OnceLock<Option<String>> = OnceLock::new();
    DIR.get_or_init(|| {
        let path = find_binary("ffmpeg");
        if path == "ffmpeg" {
            None
        } else {
            Path::new(&path).parent().map(|p| p.to_string_lossy().to_string())
        }
    })
    .clone()
}

// ────────────────────────────────────────────────────────────────────────────
// MusicBrainz helpers
// ────────────────────────────────────────────────────────────────────────────

fn mb_get(url: &str) -> Result<serde_json::Value, String> {
    let client = reqwest::blocking::Client::new();
    let resp = client
        .get(url)
        .header("User-Agent", MB_USER_AGENT)
        .send()
        .map_err(|e| format!("MusicBrainz request failed: {e}"))?;
    let body = resp
        .text()
        .map_err(|e| format!("Failed to read response: {e}"))?;
    serde_json::from_str(&body).map_err(|e| format!("Failed to parse JSON: {e}"))
}

// ────────────────────────────────────────────────────────────────────────────
// Worker: processes queue items sequentially
// ────────────────────────────────────────────────────────────────────────────

/// Ensure a worker thread is running. If one is already running, this is a no-op.
fn ensure_worker(app: &AppHandle, inner: &Arc<DownloaderStateInner>) {
    let mut running = inner.worker_running.lock().unwrap();
    if *running {
        return; // worker already active, it'll pick up the new items
    }
    *running = true;
    drop(running);

    // Reset cancel
    *inner.cancel.lock().unwrap() = false;

    let state_arc = inner.clone();
    let app = app.clone();
    let ytdlp = yt_dlp_path();

    std::thread::spawn(move || {
        loop {
            // Grab the next item from the pending queue
            let item = {
                let mut queue = state_arc.pending_queue.lock().unwrap();
                if queue.is_empty() {
                    // Nothing left — shut down worker
                    break;
                }
                queue.remove(0)
            };

            // Check cancel
            if *state_arc.cancel.lock().unwrap() {
                // Drain remaining items and mark them cancelled
                let remaining = {
                    let mut queue = state_arc.pending_queue.lock().unwrap();
                    let items: Vec<_> = queue.drain(..).collect();
                    items
                };
                // Mark current + remaining as error in state
                {
                    let mut s = state_arc.state.lock().unwrap();
                    for album_state in s.albums.iter_mut() {
                        if album_state.status == "pending" || album_state.status == "downloading" {
                            album_state.status = "cancelled".into();
                        }
                    }
                    s.is_active = false;
                }
                let _ = remaining; // just drop them
                let _ = app.emit("download-cancelled", ());
                break;
            }

            // Find the index of this item in the state.albums vec
            let album_idx = {
                let s = state_arc.state.lock().unwrap();
                match &item {
                    QueueItem::Album(req) => {
                        s.albums.iter().position(|a| {
                            a.artist == req.artist && a.album == req.album && a.status == "pending"
                        })
                    }
                    QueueItem::Song { song, .. } => {
                        let label = format!("{} (Single)", song.title);
                        s.albums.iter().position(|a| {
                            a.artist == song.artist && a.album == label && a.status == "pending"
                        })
                    }
                }
            };

            let album_idx = match album_idx {
                Some(idx) => idx,
                None => continue, // item was removed or already processed
            };

            let total_albums = {
                let s = state_arc.state.lock().unwrap();
                s.albums.len()
            };

            // Mark downloading
            {
                let mut s = state_arc.state.lock().unwrap();
                s.albums[album_idx].status = "downloading".into();
            }

            match &item {
                QueueItem::Album(req) => {
                    match download_album(&app, &state_arc, album_idx, total_albums, req, &ytdlp) {
                        Ok(_) => {
                            let mut s = state_arc.state.lock().unwrap();
                            s.albums[album_idx].status = "complete".into();
                        }
                        Err(e) => {
                            let mut s = state_arc.state.lock().unwrap();
                            s.albums[album_idx].status = "error".into();
                            s.albums[album_idx].error = Some(e.clone());
                            let _ = app.emit(
                                "download-error",
                                serde_json::json!({
                                    "artist": req.artist,
                                    "album": req.album,
                                    "error": e,
                                }),
                            );
                        }
                    }
                    let _ = app.emit(
                        "download-album-complete",
                        serde_json::json!({
                            "artist": req.artist,
                            "album": req.album,
                            "albumIndex": album_idx,
                            "totalAlbums": total_albums,
                        }),
                    );
                }
                QueueItem::Song { song, video_id } => {
                    let _ = app.emit(
                        "download-progress",
                        DownloadProgress {
                            album_index: album_idx,
                            total_albums,
                            artist: song.artist.clone(),
                            album: format!("{} (Single)", song.title),
                            track_index: 0,
                            total_tracks: 1,
                            track_name: song.title.clone(),
                            status: "downloading".into(),
                            error: None,
                        },
                    );

                    match download_single_song(&app, song, video_id, &ytdlp, album_idx, total_albums) {
                        Ok(_) => {
                            let mut s = state_arc.state.lock().unwrap();
                            s.albums[album_idx].status = "complete".into();
                            s.albums[album_idx].completed_tracks = 1;
                        }
                        Err(e) => {
                            let mut s = state_arc.state.lock().unwrap();
                            s.albums[album_idx].status = "error".into();
                            s.albums[album_idx].error = Some(e.clone());
                            let _ = app.emit(
                                "download-error",
                                serde_json::json!({
                                    "artist": song.artist,
                                    "album": song.title,
                                    "error": e,
                                }),
                            );
                        }
                    }
                    let _ = app.emit(
                        "download-album-complete",
                        serde_json::json!({
                            "artist": song.artist,
                            "album": song.title,
                            "albumIndex": album_idx,
                            "totalAlbums": total_albums,
                        }),
                    );
                }
            }
        }

        // Worker done
        {
            let mut running = state_arc.worker_running.lock().unwrap();
            *running = false;
        }

        // Check if there are any items still pending (shouldn't be, but just in case)
        let any_pending = {
            let s = state_arc.state.lock().unwrap();
            s.albums.iter().any(|a| a.status == "pending" || a.status == "downloading")
        };

        if !any_pending {
            {
                let mut s = state_arc.state.lock().unwrap();
                s.is_active = false;
            }
            let _ = app.emit("download-all-complete", ());
        }
    });
}


// ────────────────────────────────────────────────────────────────────────────
// Tauri Commands
// ────────────────────────────────────────────────────────────────────────────

/// Step 1: Search for artists by name.
#[tauri::command]
pub fn downloader_search_artist(artist: String) -> Result<Vec<MbArtist>, String> {
    let encoded = urlencoding::encode(&artist);
    let url = format!(
        "https://musicbrainz.org/ws/2/artist/?query={encoded}&fmt=json&limit=8"
    );
    let data = mb_get(&url)?;

    let artists = data["artists"]
        .as_array()
        .ok_or("No artists in response")?;

    let results: Vec<MbArtist> = artists
        .iter()
        .filter_map(|a| {
            Some(MbArtist {
                id: a["id"].as_str()?.to_string(),
                name: a["name"].as_str()?.to_string(),
                disambiguation: a["disambiguation"].as_str().unwrap_or("").to_string(),
            })
        })
        .collect();

    Ok(results)
}

/// Step 2: Get all release-groups for an artist by their MB ID.
#[tauri::command]
pub fn downloader_get_discography(artist_id: String) -> Result<Vec<MbAlbum>, String> {
    let mut all_albums: Vec<MbAlbum> = Vec::new();
    let mut offset = 0;
    let limit = 100;

    loop {
        let url = format!(
            "https://musicbrainz.org/ws/2/release-group/?artist={artist_id}&fmt=json&limit={limit}&offset={offset}"
        );
        let data = mb_get(&url)?;

        let groups = data["release-groups"]
            .as_array()
            .ok_or("No release-groups in response")?;

        if groups.is_empty() {
            break;
        }

        for rg in groups {
            let title = match rg["title"].as_str() {
                Some(t) => t.to_string(),
                None => continue,
            };
            let id = match rg["id"].as_str() {
                Some(i) => i.to_string(),
                None => continue,
            };
            let year = rg["first-release-date"]
                .as_str()
                .unwrap_or("")
                .chars()
                .take(4)
                .collect::<String>();
            let primary_type = rg["primary-type"]
                .as_str()
                .unwrap_or("")
                .to_string();
            let secondary_types: Vec<String> = rg["secondary-types"]
                .as_array()
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| v.as_str().map(|s| s.to_string()))
                        .collect()
                })
                .unwrap_or_default();

            all_albums.push(MbAlbum {
                id,
                title,
                year,
                release_type: primary_type,
                secondary_types,
            });
        }

        let total = data["release-group-count"].as_u64().unwrap_or(0) as usize;
        offset += limit;
        if offset >= total {
            break;
        }

        std::thread::sleep(std::time::Duration::from_secs(1));
    }

    all_albums.sort_by(|a, b| a.year.cmp(&b.year));
    all_albums.dedup_by(|a, b| a.title.to_lowercase() == b.title.to_lowercase());

    Ok(all_albums)
}

#[tauri::command]
pub fn downloader_get_tracklist(artist: String, album: String) -> Result<Vec<String>, String> {
    fetch_tracklist(&artist, &album)
}

/// Search YouTube for songs matching a query.
#[tauri::command]
pub fn downloader_search_songs(query: String) -> Result<Vec<YtSearchResult>, String> {
    let ytdlp = yt_dlp_path();
    let output = Command::new(&ytdlp)
        .args([
            "--no-update",
            "--flat-playlist",
            "-j",
            &format!("ytsearch10:{query}"),
        ])
        .output()
        .map_err(|e| format!("Failed to run yt-dlp: {e}"))?;

    if !output.status.success() {
        return Err("yt-dlp search failed".into());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut results = Vec::new();

    for line in stdout.lines() {
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(line) {
            let id = json["id"].as_str().unwrap_or("").to_string();
            let title = json["title"].as_str().unwrap_or("").to_string();
            let duration_secs = json["duration"].as_f64().unwrap_or(0.0);
            let mins = (duration_secs / 60.0).floor() as u32;
            let secs = (duration_secs % 60.0) as u32;
            let duration = format!("{mins}:{secs:02}");
            let channel = json["channel"].as_str()
                .or_else(|| json["uploader"].as_str())
                .unwrap_or("")
                .to_string();

            if !id.is_empty() && !title.is_empty() {
                results.push(YtSearchResult {
                    id,
                    title,
                    duration,
                    channel,
                });
            }
        }
    }

    Ok(results)
}

/// Enqueue albums for download. Can be called while downloads are already in progress.
#[tauri::command]
pub fn downloader_start(
    app: AppHandle,
    state: tauri::State<'_, DownloaderState>,
    albums: Vec<AlbumRequest>,
) -> Result<(), String> {
    // Append new album states + queue items
    {
        let mut s = state.0.state.lock().map_err(|e| e.to_string())?;
        s.is_active = true;
        for a in &albums {
            s.albums.push(AlbumDownloadState {
                artist: a.artist.clone(),
                album: a.album.clone(),
                status: "pending".into(),
                completed_tracks: 0,
                total_tracks: 0,
                error: None,
                active_tracks: vec![],
            });
        }
    }
    {
        let mut queue = state.0.pending_queue.lock().map_err(|e| e.to_string())?;
        for a in albums {
            queue.push(QueueItem::Album(a));
        }
    }

    ensure_worker(&app, &state.0);
    Ok(())
}

/// Enqueue individual songs for download. Can be called while downloads are already in progress.
#[tauri::command]
pub fn downloader_download_songs(
    app: AppHandle,
    state: tauri::State<'_, DownloaderState>,
    songs: Vec<SongRequest>,
    video_ids: Vec<String>,
) -> Result<(), String> {
    // Append new song states + queue items
    {
        let mut s = state.0.state.lock().map_err(|e| e.to_string())?;
        s.is_active = true;
        for song in &songs {
            s.albums.push(AlbumDownloadState {
                artist: song.artist.clone(),
                album: format!("{} (Single)", song.title),
                status: "pending".into(),
                completed_tracks: 0,
                total_tracks: 1,
                error: None,
                active_tracks: vec![],
            });
        }
    }
    {
        let mut queue = state.0.pending_queue.lock().map_err(|e| e.to_string())?;
        for (song, vid_id) in songs.into_iter().zip(video_ids.into_iter()) {
            queue.push(QueueItem::Song { song, video_id: vid_id });
        }
    }

    ensure_worker(&app, &state.0);
    Ok(())
}

#[tauri::command]
pub fn downloader_get_status(
    state: tauri::State<'_, DownloaderState>,
) -> Result<DownloadState, String> {
    let s = state.0.state.lock().map_err(|e| e.to_string())?;
    Ok(s.clone())
}

#[tauri::command]
pub fn downloader_cancel(state: tauri::State<'_, DownloaderState>) -> Result<(), String> {
    let mut cancel = state.0.cancel.lock().map_err(|e| e.to_string())?;
    *cancel = true;
    Ok(())
}

/// Remove completed, errored, and cancelled items from the queue display.
#[tauri::command]
pub fn downloader_clear_finished(state: tauri::State<'_, DownloaderState>) -> Result<(), String> {
    let mut s = state.0.state.lock().map_err(|e| e.to_string())?;
    s.albums.retain(|a| a.status != "complete" && a.status != "error" && a.status != "cancelled");
    if s.albums.is_empty() {
        s.is_active = false;
    }
    Ok(())
}

#[tauri::command]
pub fn downloader_trigger_scan(
    server_url: String,
    username: String,
    password: String,
) -> Result<(), String> {
    let client = reqwest::blocking::Client::new();
    let url = format!(
        "{}/rest/startScan?u={}&p={}&v=1.16.1&c=Lumina&f=json",
        server_url, username, password
    );
    client
        .get(&url)
        .send()
        .map_err(|e| format!("Scan trigger failed: {e}"))?;
    Ok(())
}

// ────────────────────────────────────────────────────────────────────────────
// Download logic
// ────────────────────────────────────────────────────────────────────────────

fn sanitize_filename(name: &str) -> String {
    name.chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '-',
            _ => c,
        })
        .collect::<String>()
        .trim()
        .to_string()
}

// ────────────────────────────────────────────────────────────────────────────
// Concurrent download helpers
// ────────────────────────────────────────────────────────────────────────────

fn emit_track_progress(
    app: &AppHandle,
    album_idx: usize,
    total_albums: usize,
    req: &AlbumRequest,
    track_idx: usize,
    total_tracks: usize,
    track_name: &str,
    status: &str,
    error: Option<&str>,
) {
    let _ = app.emit(
        "download-progress",
        DownloadProgress {
            album_index: album_idx,
            total_albums,
            artist: req.artist.clone(),
            album: req.album.clone(),
            track_index: track_idx,
            total_tracks,
            track_name: track_name.to_string(),
            status: status.to_string(),
            error: error.map(|e| e.to_string()),
        },
    );
}

fn update_album_completed(dl_state: &DownloaderStateInner, album_idx: usize, count: usize) {
    let mut s = dl_state.state.lock().unwrap();
    if album_idx < s.albums.len() {
        s.albums[album_idx].completed_tracks = count;
    }
}

fn add_active_track(
    dl_state: &DownloaderStateInner,
    album_idx: usize,
    track_idx: usize,
    track_name: &str,
    status: &str,
) {
    let mut s = dl_state.state.lock().unwrap();
    if album_idx < s.albums.len() {
        s.albums[album_idx].active_tracks.push(ActiveTrack {
            track_index: track_idx,
            track_name: track_name.to_string(),
            status: status.to_string(),
        });
    }
}

fn update_active_track_status(
    dl_state: &DownloaderStateInner,
    album_idx: usize,
    track_idx: usize,
    status: &str,
) {
    let mut s = dl_state.state.lock().unwrap();
    if album_idx < s.albums.len() {
        if let Some(at) = s.albums[album_idx]
            .active_tracks
            .iter_mut()
            .find(|t| t.track_index == track_idx)
        {
            at.status = status.to_string();
        }
    }
}

fn remove_active_track(dl_state: &DownloaderStateInner, album_idx: usize, track_idx: usize) {
    let mut s = dl_state.state.lock().unwrap();
    if album_idx < s.albums.len() {
        s.albums[album_idx]
            .active_tracks
            .retain(|t| t.track_index != track_idx);
    }
}

// ────────────────────────────────────────────────────────────────────────────
// Per-track download logic (called from concurrent workers)
// ────────────────────────────────────────────────────────────────────────────

fn process_single_track(
    app: &AppHandle,
    dl_state: &DownloaderStateInner,
    album_idx: usize,
    total_albums: usize,
    req: &AlbumRequest,
    ytdlp: &str,
    track_idx: usize,
    track_name: &str,
    total_tracks: usize,
    cover_data: Option<&[u8]>,
    album_dir: &Path,
    completed: &AtomicUsize,
    cancelled: &AtomicBool,
) {
    let track_num = format!("{:02}", track_idx + 1);
    let safe_track = sanitize_filename(track_name);
    let filename = format!("{track_num}-{safe_track}.mp3");
    let filepath = album_dir.join(&filename);

    // Skip if exists
    if filepath.exists() {
        let new_count = completed.fetch_add(1, Ordering::Relaxed) + 1;
        update_album_completed(dl_state, album_idx, new_count);
        emit_track_progress(
            app, album_idx, total_albums, req, track_idx, total_tracks, track_name, "done", None,
        );
        return;
    }

    // Register as active and search YouTube
    add_active_track(dl_state, album_idx, track_idx, track_name, "searching");
    emit_track_progress(
        app, album_idx, total_albums, req, track_idx, total_tracks, track_name, "searching", None,
    );

    let vid_id = search_youtube(ytdlp, &req.artist, track_name);
    if vid_id.is_none() {
        remove_active_track(dl_state, album_idx, track_idx);
        emit_track_progress(
            app, album_idx, total_albums, req, track_idx, total_tracks, track_name, "error",
            Some("Not found on YouTube"),
        );
        return;
    }
    let vid_id = vid_id.unwrap();

    // Check cancel between search and download
    if *dl_state.cancel.lock().unwrap() {
        cancelled.store(true, Ordering::Relaxed);
        remove_active_track(dl_state, album_idx, track_idx);
        return;
    }

    // Download
    update_active_track_status(dl_state, album_idx, track_idx, "downloading");
    emit_track_progress(
        app, album_idx, total_albums, req, track_idx, total_tracks, track_name, "downloading",
        None,
    );

    let temp_path = album_dir.join(format!("{track_num}-{safe_track}.%(ext)s"));
    let dl_ok = download_track(ytdlp, &vid_id, temp_path.to_str().unwrap_or(""));

    if !dl_ok {
        remove_active_track(dl_state, album_idx, track_idx);
        emit_track_progress(
            app, album_idx, total_albums, req, track_idx, total_tracks, track_name, "error",
            Some("Download failed"),
        );
        return;
    }

    // Check cancel between download and tagging
    if *dl_state.cancel.lock().unwrap() {
        cancelled.store(true, Ordering::Relaxed);
        remove_active_track(dl_state, album_idx, track_idx);
        return;
    }

    // Tag
    update_active_track_status(dl_state, album_idx, track_idx, "tagging");
    emit_track_progress(
        app, album_idx, total_albums, req, track_idx, total_tracks, track_name, "tagging", None,
    );

    tag_track(
        &filepath,
        track_name,
        &req.artist,
        &req.album,
        &req.year,
        track_idx + 1,
        total_tracks,
        &req.genre,
        cover_data,
    );

    // Complete
    let new_count = completed.fetch_add(1, Ordering::Relaxed) + 1;
    remove_active_track(dl_state, album_idx, track_idx);
    update_album_completed(dl_state, album_idx, new_count);
    emit_track_progress(
        app, album_idx, total_albums, req, track_idx, total_tracks, track_name, "done", None,
    );
}

// ────────────────────────────────────────────────────────────────────────────
// Album download (concurrent tracks)
// ────────────────────────────────────────────────────────────────────────────

const MAX_CONCURRENT_TRACKS: usize = 3;

fn download_album(
    app: &AppHandle,
    dl_state: &DownloaderStateInner,
    album_idx: usize,
    total_albums: usize,
    req: &AlbumRequest,
    ytdlp: &str,
) -> Result<(), String> {
    let safe_artist = sanitize_filename(&req.artist);
    let safe_album = sanitize_filename(&req.album);
    let album_dir = PathBuf::from(MUSIC_DIR)
        .join(&safe_artist)
        .join(&safe_album);

    std::fs::create_dir_all(&album_dir)
        .map_err(|e| format!("Failed to create directory: {e}"))?;

    // Fetch cover
    emit_track_progress(
        app, album_idx, total_albums, req, 0, 0, "", "fetching_cover", None,
    );

    let cover_data = fetch_cover(&req.artist, &req.album);

    // Fetch tracklist
    emit_track_progress(
        app, album_idx, total_albums, req, 0, 0, "", "fetching_tracklist", None,
    );

    let tracks = if let Some(ref t) = req.tracks {
        if t.is_empty() {
            fetch_tracklist(&req.artist, &req.album)?
        } else {
            t.clone()
        }
    } else {
        fetch_tracklist(&req.artist, &req.album)?
    };

    let total_tracks = tracks.len();

    {
        let mut s = dl_state.state.lock().unwrap();
        if album_idx < s.albums.len() {
            s.albums[album_idx].total_tracks = total_tracks;
        }
    }

    // Concurrent track downloads using scoped threads + crossbeam channel
    let completed = AtomicUsize::new(0);
    let cancelled = AtomicBool::new(false);
    let cover_ref: Option<&[u8]> = cover_data.as_deref();

    let (sender, receiver) = crossbeam_channel::bounded::<(usize, String)>(tracks.len());
    for (i, name) in tracks.iter().enumerate() {
        let _ = sender.send((i, name.clone()));
    }
    drop(sender);

    let num_workers = MAX_CONCURRENT_TRACKS.min(total_tracks);

    let cancelled_ref = &cancelled;
    let completed_ref = &completed;
    let album_dir_ref = &album_dir;

    std::thread::scope(|scope| {
        for worker_id in 0..num_workers {
            let recv = receiver.clone();
            // Stagger worker starts to avoid simultaneous YouTube searches
            if worker_id > 0 {
                std::thread::sleep(std::time::Duration::from_millis(500));
            }

            scope.spawn(move || {
                while let Ok((track_idx, track_name)) = recv.recv() {
                    if cancelled_ref.load(Ordering::Relaxed)
                        || *dl_state.cancel.lock().unwrap()
                    {
                        cancelled_ref.store(true, Ordering::Relaxed);
                        break;
                    }

                    process_single_track(
                        app, dl_state, album_idx, total_albums, req, ytdlp, track_idx,
                        &track_name, total_tracks, cover_ref, album_dir_ref, completed_ref,
                        cancelled_ref,
                    );
                }
            });
        }
    });

    if cancelled.load(Ordering::Relaxed) {
        return Err("Cancelled".into());
    }

    Ok(())
}

fn download_single_song(
    app: &AppHandle,
    song: &SongRequest,
    vid_id: &str,
    ytdlp: &str,
    idx: usize,
    total: usize,
) -> Result<(), String> {
    let safe_artist = sanitize_filename(&song.artist);
    let safe_album = if song.album.is_empty() {
        "Singles".to_string()
    } else {
        sanitize_filename(&song.album)
    };
    let safe_title = sanitize_filename(&song.title);

    let album_dir = PathBuf::from(MUSIC_DIR)
        .join(&safe_artist)
        .join(&safe_album);

    std::fs::create_dir_all(&album_dir)
        .map_err(|e| format!("Failed to create directory: {e}"))?;

    let track_num = song.track_num.unwrap_or(1);
    let filename = format!("{:02}-{}.mp3", track_num, safe_title);
    let filepath = album_dir.join(&filename);

    if filepath.exists() {
        let _ = app.emit(
            "download-progress",
            DownloadProgress {
                album_index: idx,
                total_albums: total,
                artist: song.artist.clone(),
                album: song.title.clone(),
                track_index: 0,
                total_tracks: 1,
                track_name: song.title.clone(),
                status: "done".into(),
                error: None,
            },
        );
        return Ok(());
    }

    let temp_path = album_dir.join(format!("{:02}-{}.%(ext)s", track_num, safe_title));
    let dl_ok = download_track(ytdlp, vid_id, temp_path.to_str().unwrap_or(""));

    if !dl_ok {
        return Err("Download failed".into());
    }

    let cover_data = if !song.album.is_empty() {
        fetch_cover(&song.artist, &song.album)
    } else {
        None
    };

    let _ = app.emit(
        "download-progress",
        DownloadProgress {
            album_index: idx,
            total_albums: total,
            artist: song.artist.clone(),
            album: song.title.clone(),
            track_index: 0,
            total_tracks: 1,
            track_name: song.title.clone(),
            status: "tagging".into(),
            error: None,
        },
    );

    tag_track(
        &filepath,
        &song.title,
        &song.artist,
        if song.album.is_empty() { "Singles" } else { &song.album },
        &song.year,
        track_num,
        1,
        if song.genre.is_empty() { "Rock" } else { &song.genre },
        cover_data.as_deref(),
    );

    let _ = app.emit(
        "download-progress",
        DownloadProgress {
            album_index: idx,
            total_albums: total,
            artist: song.artist.clone(),
            album: song.title.clone(),
            track_index: 0,
            total_tracks: 1,
            track_name: song.title.clone(),
            status: "done".into(),
            error: None,
        },
    );

    Ok(())
}

fn search_youtube(ytdlp: &str, artist: &str, track: &str) -> Option<String> {
    let query = format!("{artist} {track}");
    let output = Command::new(ytdlp)
        .args(["--no-update", "--print", "id", &format!("ytsearch1:{query}")])
        .output()
        .ok()?;

    if output.status.success() {
        let id = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if id.is_empty() {
            None
        } else {
            Some(id)
        }
    } else {
        None
    }
}

fn download_track(ytdlp: &str, vid_id: &str, output_path: &str) -> bool {
    let url = format!("https://www.youtube.com/watch?v={vid_id}");
    let mut cmd = Command::new(ytdlp);
    cmd.args([
        "--no-update",
        "--extractor-args", "youtube:player_client=android",
        "-x",
        "--audio-format",
        "mp3",
        "--audio-quality",
        "0",
        "-o",
        output_path,
        &url,
    ]);

    if let Some(dir) = ffmpeg_dir() {
        cmd.arg("--ffmpeg-location");
        cmd.arg(&dir);
    }

    match cmd.output() {
        Ok(output) => output.status.success(),
        Err(_) => false,
    }
}

fn fetch_cover(artist: &str, album: &str) -> Option<Vec<u8>> {
    let query_str = format!("release:{album} AND artist:{artist}");
    let encoded = urlencoding::encode(&query_str);
    let url = format!(
        "https://musicbrainz.org/ws/2/release-group/?query={encoded}&fmt=json&limit=1"
    );
    let data = mb_get(&url).ok()?;

    let rg_id = data["release-groups"]
        .as_array()?
        .first()?["id"]
        .as_str()?;

    let cover_url = format!("https://coverartarchive.org/release-group/{rg_id}/front-500");
    let client = reqwest::blocking::Client::builder()
        .redirect(reqwest::redirect::Policy::limited(5))
        .build()
        .ok()?;

    let resp = client
        .get(&cover_url)
        .header("User-Agent", MB_USER_AGENT)
        .send()
        .ok()?;

    if resp.status().is_success() {
        let bytes = resp.bytes().ok()?;
        if bytes.len() > 3 && (bytes[0..2] == [0xFF, 0xD8] || bytes[0..3] == [0x89, 0x50, 0x4E]) {
            return Some(bytes.to_vec());
        }
    }

    None
}

fn fetch_tracklist(artist: &str, album: &str) -> Result<Vec<String>, String> {
    let query_str = format!("release:{album} AND artist:{artist}");
    let encoded = urlencoding::encode(&query_str);
    let url = format!(
        "https://musicbrainz.org/ws/2/release/?query={encoded}&fmt=json&limit=1"
    );
    let data = mb_get(&url)?;

    let release_id = data["releases"]
        .as_array()
        .and_then(|r| r.first())
        .and_then(|r| r["id"].as_str())
        .ok_or("No release found on MusicBrainz")?
        .to_string();

    std::thread::sleep(std::time::Duration::from_secs(1));

    let url2 = format!(
        "https://musicbrainz.org/ws/2/release/{release_id}?inc=recordings&fmt=json"
    );
    let data2 = mb_get(&url2)?;

    let mut tracks = Vec::new();
    if let Some(media) = data2["media"].as_array() {
        for medium in media {
            if let Some(medium_tracks) = medium["tracks"].as_array() {
                for track in medium_tracks {
                    if let Some(title) = track["title"].as_str() {
                        tracks.push(title.to_string());
                    }
                }
            }
        }
    }

    if tracks.is_empty() {
        return Err("No tracks found on MusicBrainz".into());
    }

    Ok(tracks)
}

fn tag_track(
    filepath: &Path,
    title: &str,
    artist: &str,
    album: &str,
    year: &str,
    track_num: usize,
    total_tracks: usize,
    genre: &str,
    cover_data: Option<&[u8]>,
) {
    let mut tag = id3::Tag::new();

    tag.set_title(title);
    tag.set_artist(artist);
    tag.set_album(album);
    tag.set_album_artist(artist);

    if !year.is_empty() {
        tag.set_year(year.parse::<i32>().unwrap_or(0));
    }

    tag.set_track(track_num as u32);
    tag.set_total_tracks(total_tracks as u32);
    tag.set_genre(genre);

    if let Some(data) = cover_data {
        let mime = if data.len() > 3 && data[0..3] == [0x89, 0x50, 0x4E] {
            "image/png"
        } else {
            "image/jpeg"
        };
        tag.add_frame(id3::frame::Picture {
            mime_type: mime.to_string(),
            picture_type: id3::frame::PictureType::CoverFront,
            description: "Cover".to_string(),
            data: data.to_vec(),
        });
    }

    let _ = tag.write_to_path(filepath, id3::Version::Id3v24);
}
