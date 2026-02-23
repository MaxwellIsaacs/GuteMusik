use serde::{Deserialize, Serialize};

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
pub enum QueueItem {
    Album(AlbumRequest),
    Song { song: SongRequest, video_id: String },
}
