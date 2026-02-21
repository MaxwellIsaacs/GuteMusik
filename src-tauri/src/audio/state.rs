use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use std::sync::Arc;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrackInfo {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub duration_secs: f64,
    pub cover_url: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum RepeatMode {
    #[default]
    Off,
    All,
    One,
}

impl RepeatMode {
    pub fn cycle(&self) -> Self {
        match self {
            RepeatMode::Off => RepeatMode::All,
            RepeatMode::All => RepeatMode::One,
            RepeatMode::One => RepeatMode::Off,
        }
    }
}

#[derive(Debug, Clone, Serialize, Default)]
pub struct AudioState {
    pub current_track: Option<TrackInfo>,
    pub is_playing: bool,
    pub position_secs: f64,
    pub duration_secs: f64,
    pub volume: f32,
    pub is_muted: bool,
    pub is_loading: bool,
    pub error: Option<String>,
    pub repeat_mode: RepeatMode,
    pub is_shuffled: bool,
}

impl AudioState {
    pub fn new() -> Self {
        Self {
            volume: 1.0,
            ..Default::default()
        }
    }
}

pub type SharedState = Arc<RwLock<AudioState>>;

pub fn create_shared_state() -> SharedState {
    Arc::new(RwLock::new(AudioState::new()))
}
