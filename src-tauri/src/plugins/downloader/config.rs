use std::path::PathBuf;

const CONFIG_FILENAME: &str = "downloader.json";

fn config_path() -> PathBuf {
    let config_dir = dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("gutemusik");
    config_dir.join(CONFIG_FILENAME)
}

pub fn load_music_dir() -> PathBuf {
    let path = config_path();
    if path.exists() {
        if let Ok(contents) = std::fs::read_to_string(&path) {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&contents) {
                if let Some(dir) = json["music_dir"].as_str() {
                    let p = PathBuf::from(dir);
                    if p.exists() {
                        return p;
                    }
                }
            }
        }
    }
    default_music_dir()
}

pub fn save_music_dir(dir: &PathBuf) -> Result<(), String> {
    let path = config_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create config directory: {e}"))?;
    }

    let json = serde_json::json!({ "music_dir": dir.to_string_lossy() });
    let contents = serde_json::to_string_pretty(&json)
        .map_err(|e| format!("Failed to serialize config: {e}"))?;
    std::fs::write(&path, contents)
        .map_err(|e| format!("Failed to write config file: {e}"))?;
    Ok(())
}

fn default_music_dir() -> PathBuf {
    dirs::audio_dir()
        .or_else(|| dirs::home_dir().map(|h| h.join("Music")))
        .unwrap_or_else(|| PathBuf::from("Music"))
}
