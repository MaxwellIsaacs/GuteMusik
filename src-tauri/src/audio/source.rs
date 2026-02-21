//! Audio source abstraction for different playback sources.

use std::path::PathBuf;

/// Represents the source of an audio track.
#[derive(Debug, Clone)]
pub enum TrackSource {
    /// HTTP/HTTPS stream (e.g., Subsonic server)
    HttpStream { url: String },
    /// Local file on disk
    LocalFile { path: PathBuf },
}

impl TrackSource {
    /// Parse a URL string into the appropriate source type.
    ///
    /// HTTP/HTTPS URLs become `HttpStream`, everything else is treated as a local path.
    pub fn from_url(url: &str) -> Self {
        if url.starts_with("http://") || url.starts_with("https://") {
            TrackSource::HttpStream {
                url: url.to_string(),
            }
        } else {
            TrackSource::LocalFile { path: url.into() }
        }
    }
}
