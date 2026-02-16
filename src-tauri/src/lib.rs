mod audio;

use audio::engine::AudioEngineHandle;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // Initialize audio engine
            let engine = AudioEngineHandle::new(app.handle().clone())
                .expect("Failed to initialize audio engine");
            app.manage(engine);

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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
