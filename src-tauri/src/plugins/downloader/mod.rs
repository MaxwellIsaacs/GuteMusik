pub mod config;
pub mod musicbrainz;
pub mod types;
pub mod youtube;

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};

use id3::TagLike;
use tauri::{AppHandle, Emitter};

use types::*;

// ────────────────────────────────────────────────────────────────────────────
// State
// ────────────────────────────────────────────────────────────────────────────

pub struct DownloaderStateInner {
    pub state: Mutex<DownloadState>,
    pub cancel: Mutex<bool>,
    worker_running: Mutex<bool>,
    pending_queue: Mutex<Vec<QueueItem>>,
    music_dir: Mutex<PathBuf>,
}

#[derive(Clone)]
pub struct DownloaderState(pub Arc<DownloaderStateInner>);

impl Default for DownloaderState {
    fn default() -> Self {
        let music_dir = config::load_music_dir();
        Self(Arc::new(DownloaderStateInner {
            state: Mutex::new(DownloadState {
                is_active: false,
                albums: vec![],
            }),
            cancel: Mutex::new(false),
            worker_running: Mutex::new(false),
            pending_queue: Mutex::new(vec![]),
            music_dir: Mutex::new(music_dir),
        }))
    }
}

// ────────────────────────────────────────────────────────────────────────────
// Tauri Commands
// ────────────────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn downloader_search_artist(artist: String) -> Result<Vec<MbArtist>, String> {
    musicbrainz::search_artist_async(&artist).await
}

#[tauri::command]
pub async fn downloader_get_discography(artist_id: String) -> Result<Vec<MbAlbum>, String> {
    musicbrainz::get_discography_async(&artist_id).await
}

#[tauri::command]
pub fn downloader_get_tracklist(artist: String, album: String) -> Result<Vec<String>, String> {
    musicbrainz::fetch_tracklist(&artist, &album)
}

#[tauri::command]
pub async fn downloader_search_songs(query: String) -> Result<Vec<YtSearchResult>, String> {
    youtube::search_songs_async(&query).await
}

#[tauri::command]
pub fn downloader_start(
    app: AppHandle,
    state: tauri::State<'_, DownloaderState>,
    albums: Vec<AlbumRequest>,
) -> Result<(), String> {
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

#[tauri::command]
pub fn downloader_download_songs(
    app: AppHandle,
    state: tauri::State<'_, DownloaderState>,
    songs: Vec<SongRequest>,
    video_ids: Vec<String>,
) -> Result<(), String> {
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
        "{}/rest/startScan?u={}&p={}&v=1.16.1&c=GuteMusik&f=json",
        server_url, username, password
    );
    client
        .get(&url)
        .send()
        .map_err(|e| format!("Scan trigger failed: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn downloader_get_music_dir(
    state: tauri::State<'_, DownloaderState>,
) -> Result<String, String> {
    let dir = state.0.music_dir.lock().map_err(|e| e.to_string())?;
    Ok(dir.to_string_lossy().to_string())
}

#[tauri::command]
pub fn downloader_set_music_dir(
    state: tauri::State<'_, DownloaderState>,
    path: String,
) -> Result<(), String> {
    let new_dir = PathBuf::from(&path);
    if !new_dir.exists() {
        return Err("Directory does not exist".into());
    }
    if !new_dir.is_dir() {
        return Err("Path is not a directory".into());
    }

    config::save_music_dir(&new_dir)?;

    let mut dir = state.0.music_dir.lock().map_err(|e| e.to_string())?;
    *dir = new_dir;
    Ok(())
}

#[tauri::command]
pub fn downloader_retry_album(
    app: AppHandle,
    state: tauri::State<'_, DownloaderState>,
    artist: String,
    album: String,
    genre: String,
) -> Result<(), String> {
    // Remove the failed entry
    {
        let mut s = state.0.state.lock().map_err(|e| e.to_string())?;
        s.albums.retain(|a| !(a.artist == artist && a.album == album && (a.status == "error" || a.status == "cancelled")));
    }

    // Re-queue as a new album
    let albums = vec![AlbumRequest {
        artist,
        album,
        year: String::new(),
        genre: if genre.is_empty() { "Rock".into() } else { genre },
        tracks: None,
    }];

    downloader_start(app, state, albums)
}

// ────────────────────────────────────────────────────────────────────────────
// Worker thread
// ────────────────────────────────────────────────────────────────────────────

fn ensure_worker(app: &AppHandle, inner: &Arc<DownloaderStateInner>) {
    let mut running = inner.worker_running.lock().unwrap();
    if *running {
        return;
    }
    *running = true;
    drop(running);

    *inner.cancel.lock().unwrap() = false;

    let state_arc = inner.clone();
    let app = app.clone();
    let ytdlp = youtube::yt_dlp_path();

    std::thread::spawn(move || {
        loop {
            let item = {
                let mut queue = state_arc.pending_queue.lock().unwrap();
                if queue.is_empty() {
                    break;
                }
                queue.remove(0)
            };

            if *state_arc.cancel.lock().unwrap() {
                {
                    let mut queue = state_arc.pending_queue.lock().unwrap();
                    queue.clear();
                }
                {
                    let mut s = state_arc.state.lock().unwrap();
                    for album_state in s.albums.iter_mut() {
                        if album_state.status == "pending" || album_state.status == "downloading" {
                            album_state.status = "cancelled".into();
                        }
                    }
                    s.is_active = false;
                }
                let _ = app.emit("download-cancelled", ());
                break;
            }

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
                None => continue,
            };

            let total_albums = {
                let s = state_arc.state.lock().unwrap();
                s.albums.len()
            };

            {
                let mut s = state_arc.state.lock().unwrap();
                s.albums[album_idx].status = "downloading".into();
            }

            let music_dir = {
                state_arc.music_dir.lock().unwrap().clone()
            };

            match &item {
                QueueItem::Album(req) => {
                    match download_album(&app, &state_arc, album_idx, total_albums, req, &ytdlp, &music_dir) {
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

                    match download_single_song(&app, song, video_id, &ytdlp, album_idx, total_albums, &music_dir) {
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

        {
            let mut running = state_arc.worker_running.lock().unwrap();
            *running = false;
        }

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
// Download helpers
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
// Per-track download
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

    if filepath.exists() {
        let new_count = completed.fetch_add(1, Ordering::Relaxed) + 1;
        update_album_completed(dl_state, album_idx, new_count);
        emit_track_progress(
            app, album_idx, total_albums, req, track_idx, total_tracks, track_name, "done", None,
        );
        return;
    }

    add_active_track(dl_state, album_idx, track_idx, track_name, "searching");
    emit_track_progress(
        app, album_idx, total_albums, req, track_idx, total_tracks, track_name, "searching", None,
    );

    let vid_id = youtube::search_youtube(ytdlp, &req.artist, track_name);
    if vid_id.is_none() {
        remove_active_track(dl_state, album_idx, track_idx);
        emit_track_progress(
            app, album_idx, total_albums, req, track_idx, total_tracks, track_name, "error",
            Some("Not found on YouTube"),
        );
        return;
    }
    let vid_id = vid_id.unwrap();

    if *dl_state.cancel.lock().unwrap() {
        cancelled.store(true, Ordering::Relaxed);
        remove_active_track(dl_state, album_idx, track_idx);
        return;
    }

    update_active_track_status(dl_state, album_idx, track_idx, "downloading");
    emit_track_progress(
        app, album_idx, total_albums, req, track_idx, total_tracks, track_name, "downloading",
        None,
    );

    let temp_path = album_dir.join(format!("{track_num}-{safe_track}.%(ext)s"));
    let dl_ok = youtube::download_track(ytdlp, &vid_id, temp_path.to_str().unwrap_or(""));

    if !dl_ok {
        remove_active_track(dl_state, album_idx, track_idx);
        emit_track_progress(
            app, album_idx, total_albums, req, track_idx, total_tracks, track_name, "error",
            Some("Download failed"),
        );
        return;
    }

    if *dl_state.cancel.lock().unwrap() {
        cancelled.store(true, Ordering::Relaxed);
        remove_active_track(dl_state, album_idx, track_idx);
        return;
    }

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
    music_dir: &Path,
) -> Result<(), String> {
    let safe_artist = sanitize_filename(&req.artist);
    let safe_album = sanitize_filename(&req.album);
    let album_dir = music_dir.join(&safe_artist).join(&safe_album);

    std::fs::create_dir_all(&album_dir)
        .map_err(|e| format!("Failed to create directory: {e}"))?;

    emit_track_progress(
        app, album_idx, total_albums, req, 0, 0, "", "fetching_cover", None,
    );

    let cover_data = musicbrainz::fetch_cover(&req.artist, &req.album);

    emit_track_progress(
        app, album_idx, total_albums, req, 0, 0, "", "fetching_tracklist", None,
    );

    let tracks = if let Some(ref t) = req.tracks {
        if t.is_empty() {
            musicbrainz::fetch_tracklist(&req.artist, &req.album)?
        } else {
            t.clone()
        }
    } else {
        musicbrainz::fetch_tracklist(&req.artist, &req.album)?
    };

    let total_tracks = tracks.len();

    {
        let mut s = dl_state.state.lock().unwrap();
        if album_idx < s.albums.len() {
            s.albums[album_idx].total_tracks = total_tracks;
        }
    }

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
    music_dir: &Path,
) -> Result<(), String> {
    let safe_artist = sanitize_filename(&song.artist);
    let safe_album = if song.album.is_empty() {
        "Singles".to_string()
    } else {
        sanitize_filename(&song.album)
    };
    let safe_title = sanitize_filename(&song.title);

    let album_dir = music_dir.join(&safe_artist).join(&safe_album);

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
    let dl_ok = youtube::download_track(ytdlp, vid_id, temp_path.to_str().unwrap_or(""));

    if !dl_ok {
        return Err("Download failed".into());
    }

    let cover_data = if !song.album.is_empty() {
        musicbrainz::fetch_cover(&song.artist, &song.album)
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
