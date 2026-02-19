mod audio;
#[cfg(feature = "plugins")]
mod plugins;

use audio::engine::AudioEngineHandle;
#[cfg(feature = "plugins")]
use plugins::downloader::DownloaderState;
#[cfg(feature = "plugins")]
use plugins::terminal::TerminalState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // Initialize audio engine
            let engine = AudioEngineHandle::new(app.handle().clone())
                .expect("Failed to initialize audio engine");
            app.manage(engine);

            #[cfg(feature = "plugins")]
            {
                // Initialize downloader state
                app.manage(DownloaderState::default());
                // Initialize terminal state
                app.manage(TerminalState::default());
            }

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            audio::audio_play_track,
            audio::audio_pause,
            audio::audio_resume,
            audio::audio_toggle_play,
            audio::audio_stop,
            audio::audio_seek,
            audio::audio_seek_percent,
            audio::audio_set_volume,
            audio::audio_toggle_mute,
            audio::audio_toggle_shuffle,
            audio::audio_cycle_repeat,
            audio::audio_get_state,
            #[cfg(feature = "plugins")]
            plugins::downloader::downloader_search_artist,
            #[cfg(feature = "plugins")]
            plugins::downloader::downloader_get_discography,
            #[cfg(feature = "plugins")]
            plugins::downloader::downloader_get_tracklist,
            #[cfg(feature = "plugins")]
            plugins::downloader::downloader_search_songs,
            #[cfg(feature = "plugins")]
            plugins::downloader::downloader_download_songs,
            #[cfg(feature = "plugins")]
            plugins::downloader::downloader_start,
            #[cfg(feature = "plugins")]
            plugins::downloader::downloader_get_status,
            #[cfg(feature = "plugins")]
            plugins::downloader::downloader_cancel,
            #[cfg(feature = "plugins")]
            plugins::downloader::downloader_clear_finished,
            #[cfg(feature = "plugins")]
            plugins::downloader::downloader_trigger_scan,
            #[cfg(feature = "plugins")]
            plugins::terminal::terminal_spawn,
            #[cfg(feature = "plugins")]
            plugins::terminal::terminal_write,
            #[cfg(feature = "plugins")]
            plugins::terminal::terminal_resize,
            #[cfg(feature = "plugins")]
            plugins::terminal::terminal_kill,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
