import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ChromeIcon } from './ChromeIcon';
import { useAudio } from '../context/AudioContext';
import { useServer } from '../context/ServerContext';
import { formatTime } from '../utils/formatTime';
import { useAlbumCover } from '../hooks/useAlbumCover';
import { ArtistLink } from './ArtistLink';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { getCurrentWindow } from '@tauri-apps/api/window';

interface PlayerCapsuleProps {
  onToast: (msg: string) => void;
  onExpand?: () => void;
  onNavigateToArtist?: (id: string) => void;
  onNavigateToAlbum?: (id: string) => void;
  sidebarWidth?: number;
  className?: string;
}

export const PlayerCapsule: React.FC<PlayerCapsuleProps> = ({ onToast, onExpand, onNavigateToArtist, onNavigateToAlbum, sidebarWidth = 0, className = '' }) => {
  const { state, togglePlay, next, previous, seekPercent, setVolume: setAudioVolume, toggleMute } = useAudio();
  const { currentTrack, isPlaying, currentTime, duration, volume, isMuted } = state;
  const { toggleStar, queueTracks, starredTracks } = useServer();

  // Check if current track is starred (source of truth is starredTracks list)
  const isCurrentTrackLiked = currentTrack ? starredTracks.some(t => t.id === currentTrack.id) : false;

  const [showVolume, setShowVolume] = useState(false);
  const [isDraggingVolume, setIsDraggingVolume] = useState(false);
  const [isDraggingProgress, setIsDraggingProgress] = useState(false);
  const [miniPlayerOpen, setMiniPlayerOpen] = useState(false);
  const volumeRef = useRef<HTMLDivElement>(null);
  const volumePopupRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);

  // Calculate progress percentage
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  // Use refs for values accessed in the BroadcastChannel handler to avoid
  // recreating the channel on every state change
  const stateRef = useRef({ currentTrack, isPlaying, currentTime, duration, queueTracks });
  useEffect(() => {
    stateRef.current = { currentTrack, isPlaying, currentTime, duration, queueTracks };
  }, [currentTrack, isPlaying, currentTime, duration, queueTracks]);

  const togglePlayRef = useRef(togglePlay);
  const nextRef = useRef(next);
  const previousRef = useRef(previous);
  const seekPercentRef = useRef(seekPercent);
  useEffect(() => { togglePlayRef.current = togglePlay; }, [togglePlay]);
  useEffect(() => { nextRef.current = next; }, [next]);
  useEffect(() => { previousRef.current = previous; }, [previous]);
  useEffect(() => { seekPercentRef.current = seekPercent; }, [seekPercent]);

  // BroadcastChannel for mini player communication — created once
  useEffect(() => {
    channelRef.current = new BroadcastChannel('lumina-audio');

    channelRef.current.onmessage = (event: MessageEvent) => {
      if (event.data.type === 'command') {
        const { action, payload } = event.data;
        switch (action) {
          case 'play':
          case 'pause':
          case 'toggle':
            togglePlayRef.current();
            break;
          case 'next':
            nextRef.current();
            break;
          case 'previous':
            previousRef.current();
            break;
          case 'seek':
            if (typeof payload === 'number') {
              seekPercentRef.current(payload);
            }
            break;
        }
      } else if (event.data.type === 'request-state') {
        // Send current state to mini player
        const s = stateRef.current;
        channelRef.current?.postMessage({
          type: 'audio-state',
          currentTrack: s.currentTrack,
          isPlaying: s.isPlaying,
          currentTime: s.currentTime,
          duration: s.duration,
          queueTracks: s.queueTracks.slice(0, 3),
        });
      } else if (event.data.type === 'mini-player-closed') {
        setMiniPlayerOpen(false);
      } else if (event.data.type === 'show-main') {
        // Show main window when mini player requests it
        getCurrentWindow().show();
        getCurrentWindow().setFocus();
        setMiniPlayerOpen(false);
      }
    };

    return () => {
      channelRef.current?.close();
    };
  }, []);

  // Broadcast state changes to mini player (throttled for time updates)
  const lastBroadcastRef = useRef(0);
  const prevTrackIdRef = useRef(currentTrack?.id);
  const prevIsPlayingRef = useRef(isPlaying);
  useEffect(() => {
    if (!miniPlayerOpen || !channelRef.current) return;

    const trackChanged = prevTrackIdRef.current !== currentTrack?.id;
    const playStateChanged = prevIsPlayingRef.current !== isPlaying;
    prevTrackIdRef.current = currentTrack?.id;
    prevIsPlayingRef.current = isPlaying;

    // Send immediately for track/play state changes, throttle time updates to ~1Hz
    const now = Date.now();
    if (!trackChanged && !playStateChanged && now - lastBroadcastRef.current < 1000) return;
    lastBroadcastRef.current = now;

    channelRef.current.postMessage({
      type: 'audio-state',
      currentTrack,
      isPlaying,
      currentTime,
      duration,
      queueTracks: queueTracks.slice(0, 3),
    });
  }, [currentTrack, isPlaying, currentTime, duration, miniPlayerOpen, queueTracks]);

  // Open mini player window
  const openMiniPlayer = useCallback(async () => {
    try {
      // Check if mini player window already exists
      const existingWindow = await WebviewWindow.getByLabel('mini-player');
      if (existingWindow) {
        await existingWindow.show();
        await existingWindow.setFocus();
        setMiniPlayerOpen(true);
        return;
      }

      // Create new mini player window
      const miniPlayer = new WebviewWindow('mini-player', {
        url: '/mini-player.html',
        title: 'Lumina Mini Player',
        width: 320,
        height: 280,
        minWidth: 280,
        minHeight: 200,
        resizable: true,
        decorations: false,
        alwaysOnTop: true,
        skipTaskbar: false,
        center: false,
        x: 100,
        y: 100,
      });

      miniPlayer.once('tauri://created', () => {
        setMiniPlayerOpen(true);
        onToast('Mini player opened');
      });

      miniPlayer.once('tauri://error', (e) => {
        console.error('Failed to create mini player:', e);
        onToast('Failed to open mini player');
      });

    } catch (error) {
      console.error('Error opening mini player:', error);
      onToast('Failed to open mini player');
    }
  }, [onToast]);

  // Close mini player window
  const closeMiniPlayer = useCallback(async () => {
    setMiniPlayerOpen(false);
    // Tell the mini player to close itself via BroadcastChannel
    channelRef.current?.postMessage({ type: 'close' });
  }, []);

  const calculateProgressFromEvent = useCallback((e: MouseEvent | React.MouseEvent, rect: DOMRect) => {
    const x = e.clientX - rect.left;
    const pct = (x / rect.width) * 100;
    seekPercent(Math.max(0, Math.min(100, pct)));
  }, [seekPercent]);

  const handleProgressMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.preventDefault();
    setIsDraggingProgress(true);
    const rect = e.currentTarget.getBoundingClientRect();
    calculateProgressFromEvent(e, rect);
  };

  const calculateVolumeFromEvent = useCallback((e: MouseEvent | React.MouseEvent, rect: DOMRect) => {
    const y = rect.bottom - e.clientY;
    const pct = y / rect.height;
    setAudioVolume(Math.max(0, Math.min(1, pct)));
  }, [setAudioVolume]);

  const handleVolumeMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.preventDefault();
    setIsDraggingVolume(true);
    const rect = e.currentTarget.getBoundingClientRect();
    calculateVolumeFromEvent(e, rect);
  };

  // Handle volume dragging
  useEffect(() => {
    if (!isDraggingVolume) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!volumeRef.current) return;
      const rect = volumeRef.current.getBoundingClientRect();
      calculateVolumeFromEvent(e, rect);
    };

    const handleMouseUp = () => {
      setIsDraggingVolume(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingVolume, calculateVolumeFromEvent]);

  // Handle progress bar dragging
  useEffect(() => {
    if (!isDraggingProgress) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!progressRef.current) return;
      const rect = progressRef.current.getBoundingClientRect();
      calculateProgressFromEvent(e, rect);
    };

    const handleMouseUp = () => {
      setIsDraggingProgress(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingProgress, calculateProgressFromEvent]);

  // Close volume popup when clicking outside
  useEffect(() => {
    if (!showVolume) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        volumePopupRef.current &&
        !volumePopupRef.current.contains(target) &&
        !(target as Element).closest('[data-volume-toggle]')
      ) {
        setShowVolume(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showVolume]);

  // Track info with fallback
  const trackTitle = currentTrack?.title || 'No Track';
  const trackArtist = currentTrack?.artist || 'Select a song';

  // Use album cover hook for fallback
  const { coverUrl: albumArt } = useAlbumCover(
    currentTrack?.cover,
    currentTrack?.artist,
    currentTrack?.album,
    currentTrack?.id
  );

  return (
    <div
        className={`fixed bottom-8 z-[80] w-full max-w-4xl px-4 ${className}`}
        style={{ left: `calc(50% + ${(sidebarWidth + 24) / 2}px)`, transform: 'translateX(-50%)', transition: 'left 150ms ease' }}
        onClick={(e) => e.stopPropagation()}
    >
         {/* Volume Pop-up */}
         <div
            ref={volumePopupRef}
            className={`absolute right-0 bottom-full mb-4 bg-[#0a0a0a] border border-white/10 rounded-2xl p-4 flex flex-col items-center gap-4 transition-all duration-300 origin-bottom shadow-2xl z-[90] ${showVolume ? 'opacity-100 scale-100' : 'opacity-0 scale-90 pointer-events-none'}`}
         >
            <div
              ref={volumeRef}
              className="h-32 w-1.5 bg-white/10 rounded-full relative cursor-pointer group"
              onMouseDown={handleVolumeMouseDown}
            >
                <div
                  className="absolute bottom-0 left-0 w-full bg-white rounded-full group-hover:bg-purple-400 transition-colors pointer-events-none"
                  style={{ height: `${(isMuted ? 0 : volume) * 100}%` }}
                ></div>
            </div>
            <button onClick={toggleMute} className="text-white/50 hover:text-white">
              <ChromeIcon name="volume-mute" size={16} />
            </button>
         </div>

         {/* Main Capsule */}
         <div
            className="bg-[#050505]/80 backdrop-blur-2xl border border-white/10 rounded-full p-2 pr-6 shadow-[0_30px_60px_rgba(0,0,0,0.8)] flex items-center gap-4 relative overflow-hidden group hover:bg-[#050505]/90 transition-all duration-500"
         >

            {/* Left: Art & Controls */}
            <div className="flex items-center gap-4 pl-1" onClick={(e) => e.stopPropagation()}>
                <div className="w-12 h-12 bg-neutral-900 rounded-md overflow-hidden flex-shrink-0 border border-white/5 ml-3 group-hover:border-white/10 transition-colors">
                    <img src={albumArt} className="w-full h-full object-cover" alt="Album Art" />
                </div>

                {/* Minimal Controls */}
                <div className="flex items-center gap-2">
                    <button onClick={previous} className="w-8 h-8 flex items-center justify-center text-white/40 hover:text-white transition-colors hover:bg-white/5 rounded-full">
                        <ChromeIcon name="skip-backward" size={16} />
                    </button>
                    <button
                        onClick={togglePlay}
                        className="w-8 h-8 flex items-center justify-center hover:scale-105 transition-transform"
                    >
                        {isPlaying ? <ChromeIcon name="pause" size={20} /> : <ChromeIcon name="play" size={20} className="ml-0.5" />}
                    </button>
                    <button onClick={next} className="w-8 h-8 flex items-center justify-center text-white/40 hover:text-white transition-colors hover:bg-white/5 rounded-full">
                        <ChromeIcon name="skip-forward" size={16} />
                    </button>
                </div>
            </div>

            {/* Middle: Track Info */}
            <div className="flex-1 min-w-0 flex flex-col justify-center gap-0.5">
                <div className="flex items-baseline gap-3">
                    {currentTrack?.albumId && onNavigateToAlbum ? (
                        <span
                            className="font-medium text-white text-sm truncate cursor-pointer hover:underline"
                            onClick={(e) => { e.stopPropagation(); onNavigateToAlbum(currentTrack.albumId!); }}
                        >
                            {trackTitle}
                        </span>
                    ) : (
                        <span className="font-medium text-white text-sm truncate">{trackTitle}</span>
                    )}
                    <span className="text-white/40 text-xs truncate flex-shrink-0">
                      {currentTrack && onNavigateToArtist ? (
                        <ArtistLink artistName={currentTrack.artist} artistId={currentTrack.artistId} onNavigate={onNavigateToArtist} />
                      ) : trackArtist}
                    </span>
                </div>

                {/* Progress Bar */}
                <div className="flex items-center gap-3">
                    <div
                        ref={progressRef}
                        className={`flex-1 h-1 bg-white/10 rounded-full cursor-pointer group/progress relative overflow-hidden ${isDraggingProgress ? 'h-1.5' : ''}`}
                        onMouseDown={handleProgressMouseDown}
                    >
                        <div
                            className={`absolute inset-y-0 left-0 bg-white/80 rounded-full group-hover/progress:bg-white ${isDraggingProgress ? 'bg-white' : ''}`}
                            style={{ width: `${progress}%` }}
                        />
                        <div
                            className={`absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-white rounded-full transition-opacity shadow-lg ${isDraggingProgress ? 'opacity-100 scale-125' : 'opacity-0 group-hover/progress:opacity-100'}`}
                            style={{ left: `calc(${progress}% - 5px)` }}
                        />
                    </div>
                    {duration > 0 && (
                        <span className="text-white/30 font-mono text-[10px] tabular-nums flex-shrink-0">
                            {formatTime(currentTime)} / {formatTime(duration)}
                        </span>
                    )}
                </div>
            </div>

            {/* Right: Options */}
            <div className="flex items-center gap-3 pl-4 border-l border-white/5" onClick={(e) => e.stopPropagation()}>
                 <button
                    onClick={async () => {
                      if (!currentTrack) return;
                      const success = await toggleStar(currentTrack.id, 'song', isCurrentTrackLiked);
                      if (success) {
                        onToast(isCurrentTrackLiked ? "Removed from favorites" : "Added to favorites");
                      } else {
                        onToast("Failed to update favorite");
                      }
                    }}
                    className={`${isCurrentTrackLiked ? 'text-rose-500' : 'text-white/30 hover:text-white'} transition-colors`}
                 >
                    <ChromeIcon name="heart" size={18} className={isCurrentTrackLiked ? 'opacity-100' : 'opacity-60'} />
                 </button>
                 <button
                    onClick={async () => {
                      const existing = await WebviewWindow.getByLabel('mini-player');
                      if (existing) {
                        closeMiniPlayer();
                      } else {
                        openMiniPlayer();
                      }
                    }}
                    className={`transition-colors ${miniPlayerOpen ? 'text-purple-400 hover:text-purple-300' : 'text-white/30 hover:text-white'}`}
                    title={miniPlayerOpen ? 'Close mini player' : 'Open mini player'}
                 >
                    <ChromeIcon name={miniPlayerOpen ? 'minimize' : 'pip-window'} size={18} />
                 </button>
                 <button
                    data-volume-toggle
                    onClick={() => setShowVolume(!showVolume)}
                    className={`transition-colors ${showVolume ? 'text-white' : 'text-white/30 hover:text-white'}`}
                >
                    <ChromeIcon name="volume-high" size={18} />
                </button>

                 {/* Explicit Expand Button */}
                 <button
                    onClick={onExpand}
                    className="text-white/30 hover:text-white transition-colors"
                    title="Expand Player"
                 >
                    <ChromeIcon name="fullscreen" size={18} />
                 </button>
            </div>
         </div>
      </div>
  );
};
