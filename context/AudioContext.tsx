import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo, ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { useServer } from './ServerContext';
import { Track } from '../types';

// Types matching Rust AudioState
interface RustTrackInfo {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration_secs: number;
  cover_url: string | null;
}

interface RustAudioState {
  current_track: RustTrackInfo | null;
  is_playing: boolean;
  position_secs: number;
  duration_secs: number;
  volume: number;
  is_muted: boolean;
  is_loading: boolean;
  error: string | null;
}

// Frontend state (matches original interface)
interface AudioState {
  currentTrack: Track | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  isLoading: boolean;
  error: string | null;
}

interface AudioContextType {
  state: AudioState;

  // Playback controls
  playTrack: (track: Track, queue?: Track[]) => void;
  pause: () => void;
  resume: () => void;
  togglePlay: () => void;

  // Navigation
  next: () => void;
  previous: () => void;

  // Seeking
  seek: (time: number) => void;
  seekPercent: (percent: number) => void;

  // Volume
  setVolume: (volume: number) => void;
  toggleMute: () => void;

  // Shuffle & Repeat
  isShuffled: boolean;
  repeatMode: 'off' | 'all' | 'one';
  toggleShuffle: () => void;
  cycleRepeat: () => void;
}

const AudioContext = createContext<AudioContextType | null>(null);

/**
 * Parse duration string "M:SS" or "H:MM:SS" to seconds
 */
function parseDuration(duration: string): number {
  const parts = duration.split(':').map(Number);
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  } else if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return 0;
}

/**
 * Convert frontend Track to Rust TrackInfo
 */
function toRustTrack(track: Track): RustTrackInfo {
  return {
    id: track.id,
    title: track.title,
    artist: track.artist,
    album: track.album,
    duration_secs: parseDuration(track.duration),
    cover_url: track.cover || null,
  };
}

export function AudioProvider({ children }: { children: ReactNode }) {
  const { api, queueTracks, setQueueTracks } = useServer();

  const [state, setState] = useState<AudioState>({
    currentTrack: null,
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    volume: 0.8,
    isMuted: false,
    isLoading: false,
    error: null,
  });

  // Internal queue tracking
  const [playQueue, setPlayQueue] = useState<Track[]>([]);
  const [queueIndex, setQueueIndex] = useState(-1);

  // Shuffle & Repeat
  const [isShuffled, setIsShuffled] = useState(false);
  const [repeatMode, setRepeatMode] = useState<'off' | 'all' | 'one'>('off');

  // Track the current track separately for queue management
  const currentTrackRef = useRef<Track | null>(null);

  // Listen to Rust audio events
  useEffect(() => {
    const unlisteners: Promise<UnlistenFn>[] = [];

    // Main state updates from Rust (~4Hz when playing)
    unlisteners.push(
      listen<RustAudioState>('audio:state', (event) => {
        const rustState = event.payload;
        setState(s => ({
          ...s,
          isPlaying: rustState.is_playing,
          currentTime: rustState.position_secs,
          duration: rustState.duration_secs,
          volume: rustState.volume,
          isMuted: rustState.is_muted,
          isLoading: rustState.is_loading,
          error: rustState.error,
        }));
      })
    );

    // Track changed event
    unlisteners.push(
      listen<{ track: RustTrackInfo }>('audio:track-changed', (event) => {
        // Track info comes from Rust, but we maintain the full Track object
        // from our queue for additional fields (liked, format, etc.)
        const rustTrack = event.payload.track;
        const fullTrack = currentTrackRef.current;

        if (fullTrack && fullTrack.id === rustTrack.id) {
          setState(s => ({ ...s, currentTrack: fullTrack }));
        }
      })
    );

    // Track ended event - handle auto-advance
    unlisteners.push(
      listen<{ track_id: string }>('audio:track-ended', () => {
        // This is handled by the handleTrackEnded function below
        handleTrackEndedRef.current?.();
      })
    );

    // Initial state sync
    invoke<RustAudioState>('audio_get_state').then((rustState) => {
      setState(s => ({
        ...s,
        isPlaying: rustState.is_playing,
        currentTime: rustState.position_secs,
        duration: rustState.duration_secs,
        volume: rustState.volume,
        isMuted: rustState.is_muted,
        isLoading: rustState.is_loading,
        error: rustState.error,
      }));
    }).catch(() => {
      // Audio engine not ready yet, that's OK
    });

    return () => {
      unlisteners.forEach(p => p.then(unlisten => unlisten()));
    };
  }, []);

  // Ref for track ended handler (updated when queue changes)
  const handleTrackEndedRef = useRef<(() => void) | null>(null);

  // Internal play function
  const playTrackInternal = useCallback((track: Track) => {
    if (!api) return;

    currentTrackRef.current = track;
    setState(s => ({ ...s, currentTrack: track }));

    const streamUrl = api.getStreamUrl(track.id);
    const rustTrack = toRustTrack(track);

    invoke('audio_play_track', {
      track: rustTrack,
      sourceUrl: streamUrl,
    }).catch((err) => {
      setState(s => ({ ...s, error: String(err), isLoading: false }));
    });
  }, [api]);

  // Handle track ended - auto-advance logic
  const handleTrackEnded = useCallback(() => {
    // Repeat one: restart current track
    if (repeatMode === 'one') {
      const track = currentTrackRef.current;
      if (track) {
        playTrackInternal(track);
      }
      return;
    }

    if (queueTracks.length === 0) {
      if (repeatMode === 'all' && playQueue.length > 0) {
        const firstTrack = playQueue[0];
        setPlayQueue(playQueue);
        setQueueIndex(0);
        playTrackInternal(firstTrack);
        setQueueTracks(playQueue.slice(1));
      }
      return;
    }

    let nextTrack: Track;
    if (isShuffled) {
      const randomIndex = Math.floor(Math.random() * queueTracks.length);
      nextTrack = queueTracks[randomIndex];
      setQueueTracks(prev => prev.filter((_, i) => i !== randomIndex));
    } else {
      nextTrack = queueTracks[0];
      setQueueTracks(prev => prev.slice(1));
    }

    setPlayQueue(prev => [...prev.slice(0, queueIndex + 1), nextTrack]);
    setQueueIndex(i => i + 1);
    playTrackInternal(nextTrack);
  }, [queueIndex, playQueue, queueTracks, repeatMode, isShuffled, playTrackInternal, setQueueTracks]);

  // Keep the ref updated
  useEffect(() => {
    handleTrackEndedRef.current = handleTrackEnded;
  }, [handleTrackEnded]);

  // Public play function with queue support
  const playTrack = useCallback((track: Track, queue?: Track[]) => {
    if (queue && queue.length > 0) {
      setPlayQueue(queue);
      const index = queue.findIndex(t => t.id === track.id);
      setQueueIndex(index >= 0 ? index : 0);
      // Sync remaining tracks to ServerContext queue
      const remaining = queue.slice(index + 1);
      setQueueTracks(remaining);
    } else {
      // Single track - preserve existing queue, just play this track now
      setPlayQueue([track, ...queueTracks]);
      setQueueIndex(0);
    }
    playTrackInternal(track);
  }, [playTrackInternal, setQueueTracks, queueTracks]);

  const pause = useCallback(() => {
    invoke('audio_pause').catch(() => {});
  }, []);

  const resume = useCallback(() => {
    invoke('audio_resume').catch(() => {});
  }, []);

  const togglePlay = useCallback(() => {
    invoke('audio_toggle_play').catch(() => {});
  }, []);

  const next = useCallback(() => {
    if (queueTracks.length === 0) {
      if (repeatMode === 'all' && playQueue.length > 0) {
        const firstTrack = playQueue[0];
        setPlayQueue(playQueue);
        setQueueIndex(0);
        playTrackInternal(firstTrack);
        setQueueTracks(playQueue.slice(1));
      }
      return;
    }

    let nextTrack: Track;
    if (isShuffled) {
      const randomIndex = Math.floor(Math.random() * queueTracks.length);
      nextTrack = queueTracks[randomIndex];
      setQueueTracks(prev => prev.filter((_, i) => i !== randomIndex));
    } else {
      nextTrack = queueTracks[0];
      setQueueTracks(prev => prev.slice(1));
    }

    setPlayQueue(prev => [...prev.slice(0, queueIndex + 1), nextTrack]);
    setQueueIndex(i => i + 1);
    playTrackInternal(nextTrack);
  }, [queueTracks, queueIndex, playQueue, playTrackInternal, setQueueTracks, isShuffled, repeatMode]);

  const previous = useCallback(() => {
    // If more than 3 seconds in, restart current track
    if (state.currentTime > 3) {
      invoke('audio_seek', { timeSecs: 0 }).catch(() => {});
      return;
    }
    // Otherwise go to previous
    if (queueIndex > 0) {
      const prevTrack = playQueue[queueIndex - 1];
      setQueueIndex(i => i - 1);
      playTrackInternal(prevTrack);
    }
  }, [queueIndex, playQueue, playTrackInternal, state.currentTime]);

  const seek = useCallback((time: number) => {
    invoke('audio_seek', { timeSecs: time }).catch(() => {});
  }, []);

  const seekPercent = useCallback((percent: number) => {
    invoke('audio_seek_percent', { percent }).catch(() => {});
  }, []);

  const setVolume = useCallback((volume: number) => {
    const clampedVolume = Math.max(0, Math.min(1, volume));
    invoke('audio_set_volume', { volume: clampedVolume }).catch(() => {});
  }, []);

  const toggleMute = useCallback(() => {
    invoke('audio_toggle_mute').catch(() => {});
  }, []);

  const toggleShuffle = useCallback(() => {
    setIsShuffled(prev => !prev);
    invoke('audio_toggle_shuffle').catch(() => {});
  }, []);

  const cycleRepeat = useCallback(() => {
    setRepeatMode(prev => {
      if (prev === 'off') return 'all';
      if (prev === 'all') return 'one';
      return 'off';
    });
    invoke('audio_cycle_repeat').catch(() => {});
  }, []);

  const value = useMemo<AudioContextType>(() => ({
    state,
    playTrack,
    pause,
    resume,
    togglePlay,
    next,
    previous,
    seek,
    seekPercent,
    setVolume,
    toggleMute,
    isShuffled,
    repeatMode,
    toggleShuffle,
    cycleRepeat,
  }), [state, playTrack, pause, resume, togglePlay, next, previous, seek, seekPercent, setVolume, toggleMute, isShuffled, repeatMode, toggleShuffle, cycleRepeat]);

  return (
    <AudioContext.Provider value={value}>
      {children}
    </AudioContext.Provider>
  );
}

export function useAudio() {
  const context = useContext(AudioContext);
  if (!context) {
    throw new Error('useAudio must be used within an AudioProvider');
  }
  return context;
}
