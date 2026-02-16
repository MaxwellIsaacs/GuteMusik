use serde::Serialize;
use tauri::Emitter;

use crate::audio::state::{AudioState, TrackInfo};

#[derive(Clone, Serialize)]
pub struct AudioStateEvent {
    pub current_track: Option<TrackInfo>,
    pub is_playing: bool,
    pub position_secs: f64,
    pub duration_secs: f64,
    pub volume: f32,
    pub is_muted: bool,
    pub is_loading: bool,
    pub error: Option<String>,
}

impl From<&AudioState> for AudioStateEvent {
    fn from(state: &AudioState) -> Self {
        Self {
            current_track: state.current_track.clone(),
            is_playing: state.is_playing,
            position_secs: state.position_secs,
            duration_secs: state.duration_secs,
            volume: state.volume,
            is_muted: state.is_muted,
            is_loading: state.is_loading,
            error: state.error.clone(),
        }
    }
}

#[derive(Clone, Serialize)]
pub struct TrackChangedEvent {
    pub track: TrackInfo,
}

#[derive(Clone, Serialize)]
pub struct TrackEndedEvent {
    pub track_id: String,
}

pub fn emit_state_update(app: &tauri::AppHandle, state: &AudioState) {
    let event: AudioStateEvent = state.into();
    let _ = app.emit("audio:state", event);
}

pub fn emit_track_changed(app: &tauri::AppHandle, track: &TrackInfo) {
    let _ = app.emit(
        "audio:track-changed",
        TrackChangedEvent {
            track: track.clone(),
        },
    );
}

pub fn emit_track_ended(app: &tauri::AppHandle, track_id: &str) {
    let _ = app.emit(
        "audio:track-ended",
        TrackEndedEvent {
            track_id: track_id.to_string(),
        },
    );
}
