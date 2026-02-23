use std::path::Path;
use std::process::Command;

use super::types::YtSearchResult;

// ────────────────────────────────────────────────────────────────────────────
// yt-dlp / ffmpeg path resolution
// ────────────────────────────────────────────────────────────────────────────

fn find_binary(name: &str) -> String {
    // Check common Homebrew / system paths first (GUI apps don't inherit shell PATH)
    let well_known = [
        "/opt/homebrew/bin",
        "/usr/local/bin",
        "/usr/bin",
        "/bin",
    ];
    for dir in &well_known {
        let full = format!("{dir}/{name}");
        if Path::new(&full).exists() {
            return full;
        }
    }

    // Try PATH (works when launched from terminal)
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

pub fn yt_dlp_path() -> String {
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
// YouTube search (async via tokio::process)
// ────────────────────────────────────────────────────────────────────────────

pub async fn search_songs_async(query: &str) -> Result<Vec<YtSearchResult>, String> {
    let ytdlp = yt_dlp_path();
    let output = tokio::process::Command::new(&ytdlp)
        .args([
            "--no-update",
            "--flat-playlist",
            "-j",
            &format!("ytsearch10:{query}"),
        ])
        .output()
        .await
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

// ────────────────────────────────────────────────────────────────────────────
// YouTube search (sync, for worker thread)
// ────────────────────────────────────────────────────────────────────────────

pub fn search_youtube(ytdlp: &str, artist: &str, track: &str) -> Option<String> {
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

// ────────────────────────────────────────────────────────────────────────────
// Download a single track (sync, for worker thread)
// ────────────────────────────────────────────────────────────────────────────

pub fn download_track(ytdlp: &str, vid_id: &str, output_path: &str) -> bool {
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
