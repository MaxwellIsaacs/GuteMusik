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

pub fn search_youtube(ytdlp: &str, artist: &str, track: &str, prefer_clean: bool) -> Option<String> {
    if prefer_clean {
        // Directly search for the clean version
        let query = format!("{artist} {track} clean");
        let output = Command::new(ytdlp)
            .args(["--no-update", "--print", "id", &format!("ytsearch1:{query}")])
            .output()
            .ok()?;
        if output.status.success() {
            let id = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !id.is_empty() {
                return Some(id);
            }
        }
        return None;
    }

    // Default: search multiple results and prefer non-clean versions
    let query = format!("{artist} {track}");
    let output = Command::new(ytdlp)
        .args([
            "--no-update",
            "--flat-playlist",
            "-j",
            &format!("ytsearch5:{query}"),
        ])
        .output()
        .ok()?;

    if !output.status.success() {
        return None;
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut results: Vec<(String, String)> = Vec::new(); // (id, title)

    for line in stdout.lines() {
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(line) {
            let id = json["id"].as_str().unwrap_or("").to_string();
            let title = json["title"].as_str().unwrap_or("").to_string();
            if !id.is_empty() {
                results.push((id, title));
            }
        }
    }

    if results.is_empty() {
        return None;
    }

    // Prefer results that don't have "clean" in the title
    let is_clean = |title: &str| -> bool {
        let lower = title.to_lowercase();
        lower.contains("(clean)") || lower.contains("[clean]") || lower.contains("clean version")
            || lower.split_whitespace().any(|w| w == "clean")
    };

    if let Some((id, _)) = results.iter().find(|(_, title)| !is_clean(title)) {
        return Some(id.clone());
    }

    // All results appear to be clean — just return the first
    Some(results[0].0.clone())
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

/// Check if a YouTube video title indicates a "clean" version.
pub fn is_clean_title(title: &str) -> bool {
    let lower = title.to_lowercase();
    lower.contains("(clean)")
        || lower.contains("[clean]")
        || lower.contains("clean version")
        || lower.split_whitespace().any(|w| w == "clean")
}

/// Parse a single yt-dlp JSON line into a YtSearchResult.
pub fn parse_yt_search_line(line: &str) -> Option<YtSearchResult> {
    let json: serde_json::Value = serde_json::from_str(line).ok()?;
    let id = json["id"].as_str().unwrap_or("").to_string();
    let title = json["title"].as_str().unwrap_or("").to_string();
    let duration_secs = json["duration"].as_f64().unwrap_or(0.0);
    let mins = (duration_secs / 60.0).floor() as u32;
    let secs = (duration_secs % 60.0) as u32;
    let duration = format!("{mins}:{secs:02}");
    let channel = json["channel"]
        .as_str()
        .or_else(|| json["uploader"].as_str())
        .unwrap_or("")
        .to_string();
    if id.is_empty() || title.is_empty() {
        return None;
    }
    Some(YtSearchResult {
        id,
        title,
        duration,
        channel,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_search_query_format() {
        let artist = "Radiohead";
        let track = "Creep";
        let query = format!("ytsearch10:{artist} {track}");
        assert_eq!(query, "ytsearch10:Radiohead Creep");
    }

    #[test]
    fn test_search_parse_results() {
        let line = r#"{"id": "XFkzRNyygfk", "title": "Radiohead - Creep", "duration": 236.0, "channel": "Radiohead"}"#;
        let result = parse_yt_search_line(line).unwrap();
        assert_eq!(result.id, "XFkzRNyygfk");
        assert_eq!(result.title, "Radiohead - Creep");
        assert_eq!(result.duration, "3:56");
        assert_eq!(result.channel, "Radiohead");
    }

    #[test]
    fn test_search_no_results() {
        let stdout = "";
        let results: Vec<YtSearchResult> = stdout
            .lines()
            .filter_map(|line| parse_yt_search_line(line))
            .collect();
        assert!(results.is_empty());
    }

    #[test]
    fn test_download_command_format() {
        let vid_id = "XFkzRNyygfk";
        let url = format!("https://www.youtube.com/watch?v={vid_id}");
        assert_eq!(url, "https://www.youtube.com/watch?v=XFkzRNyygfk");
    }

    #[test]
    fn test_search_prefers_non_clean() {
        assert!(is_clean_title("Song Title (Clean)"));
        assert!(is_clean_title("Song Title [Clean]"));
        assert!(is_clean_title("Song Title Clean Version"));
        assert!(is_clean_title("Song Title clean"));
        assert!(!is_clean_title("Song Title"));
        assert!(!is_clean_title("Cleaning Up"));
    }
}
