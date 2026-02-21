use tauri::State;

use crate::audio::engine::AudioEngineHandle;
use crate::audio::state::{AudioState, TrackInfo};

#[tauri::command]
pub fn audio_play_track(
    track: TrackInfo,
    source_url: String,
    engine: State<'_, AudioEngineHandle>,
) -> Result<(), String> {
    engine.play_track(track, &source_url)
}

#[tauri::command]
pub fn audio_pause(engine: State<'_, AudioEngineHandle>) {
    engine.pause();
}

#[tauri::command]
pub fn audio_resume(engine: State<'_, AudioEngineHandle>) {
    engine.resume();
}

#[tauri::command]
pub fn audio_toggle_play(engine: State<'_, AudioEngineHandle>) {
    engine.toggle_play();
}

#[tauri::command]
pub fn audio_stop(engine: State<'_, AudioEngineHandle>) {
    engine.stop();
}

#[tauri::command]
pub fn audio_seek(time_secs: f64, engine: State<'_, AudioEngineHandle>) {
    engine.seek(time_secs);
}

#[tauri::command]
pub fn audio_seek_percent(percent: f64, engine: State<'_, AudioEngineHandle>) {
    let state = engine.get_state();
    let position = state.duration_secs * (percent / 100.0);
    engine.seek(position);
}

#[tauri::command]
pub fn audio_set_volume(volume: f32, engine: State<'_, AudioEngineHandle>) {
    engine.set_volume(volume);
}

#[tauri::command]
pub fn audio_toggle_mute(engine: State<'_, AudioEngineHandle>) {
    engine.toggle_mute();
}

#[tauri::command]
pub fn audio_toggle_shuffle(engine: State<'_, AudioEngineHandle>) {
    engine.toggle_shuffle();
}

#[tauri::command]
pub fn audio_cycle_repeat(engine: State<'_, AudioEngineHandle>) {
    engine.cycle_repeat();
}

#[tauri::command]
pub fn audio_get_state(engine: State<'_, AudioEngineHandle>) -> AudioState {
    engine.get_state()
}
