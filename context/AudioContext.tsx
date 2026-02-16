import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo, ReactNode } from 'react';
import { useServer } from './ServerContext';
import { Track } from '../types';

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

export function AudioProvider({ children }: { children: ReactNode }) {
  const { api, queueTracks, setQueueTracks } = useServer();
  const audioRef = useRef<HTMLAudioElement | null>(null);

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

  // Internal play function — declared before effects that reference it
  const playTrackInternal = useCallback((track: Track) => {
    if (!api || !audioRef.current) return;

    const streamUrl = api.getStreamUrl(track.id);
    audioRef.current.src = streamUrl;
    audioRef.current.play().catch(() => {
      setState(s => ({ ...s, error: 'Failed to start playback', isLoading: false }));
    });

    setState(s => ({
      ...s,
      currentTrack: track,
      isPlaying: true,
      isLoading: true,
      error: null,
      currentTime: 0,
    }));
  }, [api]);

  // Initialize audio element once
  useEffect(() => {
    const audio = new Audio();
    audio.volume = state.volume;
    audioRef.current = audio;

    // Throttle timeupdate to ~2Hz (every 500ms) to reduce re-render cascades.
    // Each fire creates a new state object and re-renders every consumer
    // (PlayerCapsule, FullScreenPlayer, QueueView). On Linux/GTK this
    // competes with scroll compositing, so we keep it as low as possible.
    let lastTimeUpdate = 0;
    let rafId: number | null = null;
    const handleTimeUpdate = () => {
      const now = performance.now();
      if (now - lastTimeUpdate < 500) return;
      lastTimeUpdate = now;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        setState(s => {
          // Skip update if time hasn't meaningfully changed (< 0.4s)
          if (Math.abs(s.currentTime - audio.currentTime) < 0.4) return s;
          return { ...s, currentTime: audio.currentTime };
        });
      });
    };

    const handleLoadedMetadata = () => {
      setState(s => ({ ...s, duration: audio.duration, isLoading: false }));
    };

    const handleEnded = () => {
      // Placeholder — replaced by the dynamic ended handler effect below
      setState(s => ({ ...s, isPlaying: false, currentTime: 0 }));
    };

    const handleError = () => {
      setState(s => ({ ...s, error: 'Playback failed', isLoading: false, isPlaying: false }));
    };

    const handleWaiting = () => {
      setState(s => ({ ...s, isLoading: true }));
    };

    const handleCanPlay = () => {
      setState(s => ({ ...s, isLoading: false }));
    };

    const handlePlay = () => {
      setState(s => ({ ...s, isPlaying: true }));
    };

    const handlePause = () => {
      setState(s => ({ ...s, isPlaying: false }));
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);
    audio.addEventListener('waiting', handleWaiting);
    audio.addEventListener('canplay', handleCanPlay);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);

    return () => {
      audio.pause();
      audio.src = '';
      if (rafId) cancelAnimationFrame(rafId);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
      audio.removeEventListener('waiting', handleWaiting);
      audio.removeEventListener('canplay', handleCanPlay);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
    };
  }, []);

  // Update ended handler when queue changes
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleEnded = () => {
      // Repeat one: restart current track
      if (repeatMode === 'one') {
        if (audio) {
          audio.currentTime = 0;
          audio.play().catch(() => {});
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
        } else {
          setState(s => ({ ...s, isPlaying: false, currentTime: 0 }));
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
    };

    audio.removeEventListener('ended', handleEnded);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('ended', handleEnded);
    };
  }, [queueIndex, playQueue, queueTracks, repeatMode, isShuffled, playTrackInternal, setQueueTracks]);

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
      // The current queueTracks will be played after this track
      setPlayQueue([track, ...queueTracks]);
      setQueueIndex(0);
    }
    playTrackInternal(track);
  }, [playTrackInternal, setQueueTracks, queueTracks]);

  const pause = useCallback(() => {
    audioRef.current?.pause();
  }, []);

  const resume = useCallback(() => {
    audioRef.current?.play().catch(() => {
      setState(s => ({ ...s, error: 'Failed to resume playback' }));
    });
  }, []);

  const togglePlay = useCallback(() => {
    if (state.isPlaying) {
      pause();
    } else if (state.currentTrack) {
      resume();
    }
  }, [state.isPlaying, state.currentTrack, pause, resume]);

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
    if (audioRef.current && audioRef.current.currentTime > 3) {
      audioRef.current.currentTime = 0;
      return;
    }
    // Otherwise go to previous
    if (queueIndex > 0) {
      const prevTrack = playQueue[queueIndex - 1];
      setQueueIndex(i => i - 1);
      playTrackInternal(prevTrack);
    }
  }, [queueIndex, playQueue, playTrackInternal]);

  const seek = useCallback((time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time;
    }
  }, []);

  const seekPercent = useCallback((percent: number) => {
    if (audioRef.current && state.duration > 0) {
      audioRef.current.currentTime = (percent / 100) * state.duration;
    }
  }, [state.duration]);

  const setVolume = useCallback((volume: number) => {
    const clampedVolume = Math.max(0, Math.min(1, volume));
    if (audioRef.current) {
      audioRef.current.volume = clampedVolume;
    }
    setState(s => ({ ...s, volume: clampedVolume, isMuted: clampedVolume === 0 }));
  }, []);

  const toggleMute = useCallback(() => {
    if (audioRef.current) {
      if (state.isMuted) {
        audioRef.current.volume = state.volume || 0.8;
        setState(s => ({ ...s, isMuted: false }));
      } else {
        audioRef.current.volume = 0;
        setState(s => ({ ...s, isMuted: true }));
      }
    }
  }, [state.isMuted, state.volume]);

  const toggleShuffle = useCallback(() => {
    setIsShuffled(prev => !prev);
  }, []);

  const cycleRepeat = useCallback(() => {
    setRepeatMode(prev => {
      if (prev === 'off') return 'all';
      if (prev === 'all') return 'one';
      return 'off';
    });
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
