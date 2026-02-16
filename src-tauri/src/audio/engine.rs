//! Audio engine implementation using Rodio.
//!
//! Architecture:
//! - `AudioEngineHandle`: Tauri-managed handle (Send + Sync) that sends commands to audio thread
//! - `AudioThread`: Dedicated thread that owns the audio output and processes commands
//! - Uses crossbeam channels for thread-safe command passing
//! - SharedState (Arc<RwLock<AudioState>>) for reading state from any thread

use std::io::{BufReader, Cursor};
use std::thread;
use std::time::{Duration, Instant};

use crossbeam_channel::{bounded, Receiver, Sender};
use rodio::{Decoder, OutputStream, Sink};

use crate::audio::events;
use crate::audio::source::TrackSource;
use crate::audio::state::{create_shared_state, AudioState, SharedState, TrackInfo};

/// Interval for position updates and track-end checks
const TICK_INTERVAL: Duration = Duration::from_millis(250);

/// Commands sent to the audio thread
#[derive(Debug)]
pub enum AudioCommand {
    PlayTrack {
        track: TrackInfo,
        source_url: String,
    },
    Pause,
    Resume,
    Stop,
    Seek(f64),
    SetVolume(f32),
    SetMuted(bool),
    ToggleShuffle,
    CycleRepeat,
}

/// Handle for accessing the audio engine from Tauri commands.
///
/// This struct is Send + Sync and safe to manage with Tauri's state system.
/// It communicates with the audio thread via a command channel.
pub struct AudioEngineHandle {
    cmd_tx: Sender<AudioCommand>,
    state: SharedState,
}

impl AudioEngineHandle {
    /// Create a new audio engine and spawn the audio thread.
    pub fn new(app_handle: tauri::AppHandle) -> Result<Self, String> {
        let (cmd_tx, cmd_rx) = bounded::<AudioCommand>(32);
        let state = create_shared_state();

        // Spawn the audio thread
        let state_clone = state.clone();
        thread::Builder::new()
            .name("lumina-audio".into())
            .spawn(move || {
                AudioThread::run(cmd_rx, state_clone, app_handle);
            })
            .map_err(|e| format!("Failed to spawn audio thread: {}", e))?;

        log::info!("Audio engine initialized");
        Ok(Self { cmd_tx, state })
    }

    /// Play a track from the given source URL.
    pub fn play_track(&self, track: TrackInfo, source_url: &str) -> Result<(), String> {
        log::info!("Playing track: {} - {}", track.artist, track.title);
        self.cmd_tx
            .send(AudioCommand::PlayTrack {
                track,
                source_url: source_url.to_string(),
            })
            .map_err(|e| format!("Audio thread not responding: {}", e))
    }

    pub fn pause(&self) {
        let _ = self.cmd_tx.send(AudioCommand::Pause);
    }

    pub fn resume(&self) {
        let _ = self.cmd_tx.send(AudioCommand::Resume);
    }

    pub fn toggle_play(&self) {
        if self.state.read().is_playing {
            self.pause();
        } else {
            self.resume();
        }
    }

    pub fn stop(&self) {
        let _ = self.cmd_tx.send(AudioCommand::Stop);
    }

    pub fn seek(&self, position_secs: f64) {
        let _ = self.cmd_tx.send(AudioCommand::Seek(position_secs));
    }

    pub fn set_volume(&self, volume: f32) {
        let _ = self.cmd_tx.send(AudioCommand::SetVolume(volume));
    }

    pub fn toggle_mute(&self) {
        let is_muted = self.state.read().is_muted;
        let _ = self.cmd_tx.send(AudioCommand::SetMuted(!is_muted));
    }

    pub fn toggle_shuffle(&self) {
        let _ = self.cmd_tx.send(AudioCommand::ToggleShuffle);
    }

    pub fn cycle_repeat(&self) {
        let _ = self.cmd_tx.send(AudioCommand::CycleRepeat);
    }

    pub fn get_state(&self) -> AudioState {
        self.state.read().clone()
    }
}

/// Tracks playback position using wall-clock time.
///
/// Since Rodio doesn't expose the current playback position, we track it
/// by measuring elapsed time while playing.
struct PositionTracker {
    /// When playback started (or resumed)
    play_start: Option<Instant>,
    /// Accumulated position from previous play segments
    accumulated_secs: f64,
}

impl PositionTracker {
    fn new() -> Self {
        Self {
            play_start: None,
            accumulated_secs: 0.0,
        }
    }

    /// Start or resume tracking
    fn start(&mut self) {
        if self.play_start.is_none() {
            self.play_start = Some(Instant::now());
        }
    }

    /// Pause tracking, accumulating elapsed time
    fn pause(&mut self) {
        if let Some(start) = self.play_start.take() {
            self.accumulated_secs += start.elapsed().as_secs_f64();
        }
    }

    /// Reset to zero
    fn reset(&mut self) {
        self.play_start = None;
        self.accumulated_secs = 0.0;
    }

    /// Seek to a specific position
    fn seek(&mut self, position_secs: f64) {
        self.accumulated_secs = position_secs;
        // Reset the start time if currently playing
        if self.play_start.is_some() {
            self.play_start = Some(Instant::now());
        }
    }

    /// Get current position in seconds
    fn position(&self) -> f64 {
        let current_segment = self
            .play_start
            .map(|t| t.elapsed().as_secs_f64())
            .unwrap_or(0.0);
        self.accumulated_secs + current_segment
    }

    /// Check if currently tracking (playing)
    fn is_playing(&self) -> bool {
        self.play_start.is_some()
    }
}

/// The audio processing thread.
///
/// This thread owns the Rodio OutputStream and Sink, which are not Send.
/// It processes commands from the channel and emits events to the frontend.
struct AudioThread {
    _stream: OutputStream,
    sink: Sink,
    state: SharedState,
    app_handle: tauri::AppHandle,
    position: PositionTracker,
    /// Track ID of currently playing track (for track-end events)
    current_track_id: Option<String>,
    /// Last time we emitted a state update
    last_state_emit: Instant,
}

impl AudioThread {
    /// Main loop for the audio thread.
    fn run(cmd_rx: Receiver<AudioCommand>, state: SharedState, app_handle: tauri::AppHandle) {
        // Initialize audio output on this thread
        let (stream, stream_handle) = match OutputStream::try_default() {
            Ok(s) => s,
            Err(e) => {
                log::error!("Failed to open audio output: {}", e);
                let mut state = state.write();
                state.error = Some(format!("Audio output unavailable: {}", e));
                return;
            }
        };

        let sink = match Sink::try_new(&stream_handle) {
            Ok(s) => s,
            Err(e) => {
                log::error!("Failed to create audio sink: {}", e);
                let mut state = state.write();
                state.error = Some(format!("Failed to initialize audio: {}", e));
                return;
            }
        };

        log::info!("Audio thread started");

        let mut thread = Self {
            _stream: stream,
            sink,
            state,
            app_handle,
            position: PositionTracker::new(),
            current_track_id: None,
            last_state_emit: Instant::now(),
        };

        // Main loop: process commands with timeout for periodic tasks
        loop {
            match cmd_rx.recv_timeout(TICK_INTERVAL) {
                Ok(cmd) => thread.handle_command(cmd),
                Err(crossbeam_channel::RecvTimeoutError::Timeout) => {
                    // Periodic tick - update position and check track end
                    thread.tick();
                }
                Err(crossbeam_channel::RecvTimeoutError::Disconnected) => {
                    log::info!("Audio thread shutting down");
                    break;
                }
            }
        }
    }

    /// Periodic tick for position updates and track-end detection
    fn tick(&mut self) {
        // Check if track ended
        if self.sink.empty() && self.position.is_playing() {
            self.on_track_ended();
            return;
        }

        // Update position in state and emit events (~4Hz when playing)
        if self.position.is_playing() && self.last_state_emit.elapsed() >= Duration::from_millis(250)
        {
            let position = self.position.position();
            {
                let mut state = self.state.write();
                state.position_secs = position;
            }
            self.emit_state();
            self.last_state_emit = Instant::now();
        }
    }

    /// Handle track ending naturally
    fn on_track_ended(&mut self) {
        log::debug!("Track ended");

        // Emit track ended event
        if let Some(track_id) = self.current_track_id.take() {
            events::emit_track_ended(&self.app_handle, &track_id);
        }

        // Reset state
        self.position.reset();
        {
            let mut state = self.state.write();
            state.is_playing = false;
            state.position_secs = 0.0;
            // Don't clear current_track - frontend may want to show what just finished
        }
        self.emit_state();
    }

    fn handle_command(&mut self, cmd: AudioCommand) {
        match cmd {
            AudioCommand::PlayTrack { track, source_url } => {
                self.play_track(track, &source_url);
            }
            AudioCommand::Pause => self.pause(),
            AudioCommand::Resume => self.resume(),
            AudioCommand::Stop => self.stop(),
            AudioCommand::Seek(pos) => self.seek(pos),
            AudioCommand::SetVolume(vol) => self.set_volume(vol),
            AudioCommand::SetMuted(muted) => self.set_muted(muted),
            AudioCommand::ToggleShuffle => self.toggle_shuffle(),
            AudioCommand::CycleRepeat => self.cycle_repeat(),
        }
    }

    fn play_track(&mut self, track: TrackInfo, source_url: &str) {
        let source = TrackSource::from_url(source_url);

        // Update state to loading
        {
            let mut state = self.state.write();
            state.is_loading = true;
            state.error = None;
            state.current_track = Some(track.clone());
            state.duration_secs = track.duration_secs;
        }
        self.emit_state();

        // Store track ID for end detection
        self.current_track_id = Some(track.id.clone());

        // Load and play
        let result = match source {
            TrackSource::LocalFile { path } => self.load_local_file(&path),
            TrackSource::HttpStream { url } => self.load_http_stream(&url),
        };

        match result {
            Ok(()) => {
                self.position.reset();
                self.position.start();

                // Apply current volume
                let volume = {
                    let state = self.state.read();
                    if state.is_muted {
                        0.0
                    } else {
                        state.volume
                    }
                };
                self.sink.set_volume(volume);

                {
                    let mut state = self.state.write();
                    state.is_loading = false;
                    state.is_playing = true;
                    state.position_secs = 0.0;
                }
                self.emit_state();
                events::emit_track_changed(&self.app_handle, &track);
                log::debug!("Playback started");
            }
            Err(e) => {
                log::error!("Failed to play track: {}", e);
                self.current_track_id = None;
                {
                    let mut state = self.state.write();
                    state.is_loading = false;
                    state.is_playing = false;
                    state.error = Some(e);
                }
                self.emit_state();
            }
        }
    }

    fn load_local_file(&mut self, path: &std::path::Path) -> Result<(), String> {
        log::debug!("Loading local file: {}", path.display());

        let file = std::fs::File::open(path)
            .map_err(|e| format!("Cannot open file: {}", e))?;

        let decoder = Decoder::new(BufReader::new(file))
            .map_err(|e| format!("Unsupported audio format: {}", e))?;

        self.sink.stop();
        self.sink.append(decoder);
        self.sink.play();
        Ok(())
    }

    fn load_http_stream(&mut self, url: &str) -> Result<(), String> {
        log::debug!("Loading HTTP stream: {}", url);

        let response = reqwest::blocking::get(url)
            .map_err(|e| format!("Network error: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("Server error: {}", response.status()));
        }

        let bytes = response
            .bytes()
            .map_err(|e| format!("Failed to download: {}", e))?;

        log::debug!("Downloaded {} bytes", bytes.len());

        let decoder = Decoder::new(Cursor::new(bytes.to_vec()))
            .map_err(|e| format!("Unsupported audio format: {}", e))?;

        self.sink.stop();
        self.sink.append(decoder);
        self.sink.play();
        Ok(())
    }

    fn pause(&mut self) {
        if !self.state.read().is_playing {
            return; // Already paused
        }

        self.sink.pause();
        self.position.pause();

        {
            let mut state = self.state.write();
            state.is_playing = false;
            state.position_secs = self.position.position();
        }
        self.emit_state();
        log::debug!("Paused at {:.1}s", self.position.position());
    }

    fn resume(&mut self) {
        // Can't resume if nothing is loaded
        if self.sink.empty() {
            return;
        }

        if self.state.read().is_playing {
            return; // Already playing
        }

        self.sink.play();
        self.position.start();

        {
            let mut state = self.state.write();
            state.is_playing = true;
        }
        self.emit_state();
        log::debug!("Resumed");
    }

    fn stop(&mut self) {
        self.sink.stop();
        self.position.reset();
        self.current_track_id = None;

        {
            let mut state = self.state.write();
            state.is_playing = false;
            state.position_secs = 0.0;
            state.current_track = None;
        }
        self.emit_state();
        log::debug!("Stopped");
    }

    fn seek(&mut self, position_secs: f64) {
        let duration = self.state.read().duration_secs;
        let clamped = position_secs.clamp(0.0, duration);

        match self.sink.try_seek(Duration::from_secs_f64(clamped)) {
            Ok(()) => {
                log::debug!("Seeked to {:.1}s", clamped);
            }
            Err(e) => {
                log::warn!("Seek failed: {}", e);
            }
        }

        self.position.seek(clamped);

        {
            let mut state = self.state.write();
            state.position_secs = clamped;
        }
        self.emit_state();
    }

    fn set_volume(&mut self, volume: f32) {
        let volume = volume.clamp(0.0, 1.0);

        {
            let mut state = self.state.write();
            state.volume = volume;
            if !state.is_muted {
                self.sink.set_volume(volume);
            }
        }
        self.emit_state();
    }

    fn set_muted(&mut self, muted: bool) {
        {
            let mut state = self.state.write();
            state.is_muted = muted;
            self.sink.set_volume(if muted { 0.0 } else { state.volume });
        }
        self.emit_state();
    }

    fn toggle_shuffle(&mut self) {
        {
            let mut state = self.state.write();
            state.is_shuffled = !state.is_shuffled;
        }
        self.emit_state();
    }

    fn cycle_repeat(&mut self) {
        {
            let mut state = self.state.write();
            state.repeat_mode = state.repeat_mode.cycle();
        }
        self.emit_state();
    }

    /// Emit current state to frontend
    fn emit_state(&self) {
        let state = self.state.read();
        events::emit_state_update(&self.app_handle, &state);
    }
}
