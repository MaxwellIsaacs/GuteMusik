import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, CaretUp } from '@phosphor-icons/react';
import { ChromeIcon } from './ChromeIcon';
import { useAlbumCover } from '../hooks/useAlbumCover';
import { formatTime } from '../utils/formatTime';
import { fetchLyrics, findActiveLyricIndex, SyncedLyric } from '../services/lyrics';
import { Track } from '../types';
import { getCurrentWindow } from '@tauri-apps/api/window';

interface AudioStateMessage {
  type: 'audio-state';
  currentTrack: Track | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  queueTracks?: Track[];
}

interface CommandMessage {
  type: 'command';
  action: 'play' | 'pause' | 'toggle' | 'next' | 'previous' | 'seek';
  payload?: number;
}

export const MiniPlayer: React.FC = () => {
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [upNext, setUpNext] = useState<Track[]>([]);
  const [showLyrics, setShowLyrics] = useState(false);
  const [lyrics, setLyrics] = useState<SyncedLyric[]>([]);
  const [isSyncedLyrics, setIsSyncedLyrics] = useState(false);
  const [isLoadingLyrics, setIsLoadingLyrics] = useState(false);
  const [activeLyricIndex, setActiveLyricIndex] = useState(0);
  const [lyricsScrolled, setLyricsScrolled] = useState(false);
  const progressRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const lyricsRef = useRef<HTMLDivElement>(null);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  const { coverUrl: albumArt } = useAlbumCover(
    currentTrack?.cover,
    currentTrack?.artist,
    currentTrack?.album,
    currentTrack?.id
  );

  // Initialize BroadcastChannel
  useEffect(() => {
    channelRef.current = new BroadcastChannel('lumina-audio');

    channelRef.current.onmessage = (event: MessageEvent<AudioStateMessage | { type: 'close' }>) => {
      if (event.data.type === 'close') {
        channelRef.current?.postMessage({ type: 'mini-player-closed' });
        getCurrentWindow().close();
        return;
      }
      if (event.data.type === 'audio-state') {
        setCurrentTrack(event.data.currentTrack);
        setIsPlaying(event.data.isPlaying);
        if (!isDragging) {
          setCurrentTime(event.data.currentTime);
        }
        setDuration(event.data.duration);
        if (event.data.queueTracks) {
          setUpNext(event.data.queueTracks);
        }
      }
    };

    channelRef.current.postMessage({ type: 'request-state' });

    return () => { channelRef.current?.close(); };
  }, [isDragging]);

  const sendCommand = useCallback((action: CommandMessage['action'], payload?: number) => {
    channelRef.current?.postMessage({ type: 'command', action, payload });
  }, []);

  // Fetch lyrics when track changes
  const prevTrackIdRef = useRef<string | undefined>();
  useEffect(() => {
    if (!showLyrics) return;
    if (currentTrack?.id === prevTrackIdRef.current) return;
    prevTrackIdRef.current = currentTrack?.id;

    if (!currentTrack) {
      setLyrics([]);
      return;
    }

    const loadLyrics = async () => {
      setIsLoadingLyrics(true);
      setActiveLyricIndex(0);
      try {
        const result = await fetchLyrics({
          artist: currentTrack.artist,
          title: currentTrack.title,
          album: currentTrack.album,
          duration: duration > 0 ? Math.round(duration) : undefined,
          trackId: currentTrack.id,
        });
        if (result && result.lyrics.length > 0) {
          setLyrics(result.lyrics);
          setIsSyncedLyrics(result.isSynced);
        } else {
          setLyrics([]);
          setIsSyncedLyrics(false);
        }
      } catch {
        setLyrics([]);
        setIsSyncedLyrics(false);
      }
      setIsLoadingLyrics(false);
    };

    loadLyrics();
  }, [currentTrack?.id, showLyrics, duration]);

  // Update active lyric
  useEffect(() => {
    if (!showLyrics || lyrics.length === 0 || duration === 0) return;
    const newIndex = findActiveLyricIndex(lyrics, currentTime, isSyncedLyrics, duration);
    if (newIndex !== activeLyricIndex && newIndex >= 0) {
      setActiveLyricIndex(newIndex);
    }
  }, [currentTime, duration, lyrics, isSyncedLyrics, showLyrics, activeLyricIndex]);

  // Scroll active lyric into view
  useEffect(() => {
    if (lyricsRef.current && lyrics.length > 0) {
      const el = lyricsRef.current.querySelector(`[data-lyric="${activeLyricIndex}"]`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeLyricIndex, lyrics.length]);

  // Reset lyrics when toggling off
  useEffect(() => {
    if (!showLyrics) {
      prevTrackIdRef.current = undefined;
    }
  }, [showLyrics]);

  const handleProgressMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pct = (x / rect.width) * 100;
    sendCommand('seek', Math.max(0, Math.min(100, pct)));
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!progressRef.current) return;
      const rect = progressRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const pct = (x / rect.width) * 100;
      sendCommand('seek', Math.max(0, Math.min(100, pct)));
    };

    const handleMouseUp = () => setIsDragging(false);

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, sendCommand]);

  const handleClose = async () => {
    channelRef.current?.postMessage({ type: 'mini-player-closed' });
    await getCurrentWindow().close();
  };

  const trackTitle = currentTrack?.title || 'No Track';
  const trackArtist = currentTrack?.artist || 'Select a song';

  return (
    <div className="w-full h-full bg-[#0a0a0a] text-white overflow-hidden font-sans select-none flex flex-col">
      {/* Title bar: drag region + toggle & close on right */}
      <div data-tauri-drag-region className="flex items-center h-7 px-2 flex-shrink-0 z-50">
        <div className="flex-1" />
        <div className="flex items-center gap-2 text-[10px]">
          <button
            onClick={() => setShowLyrics(false)}
            className={`font-medium transition-colors ${!showLyrics ? 'text-white' : 'text-white/30 hover:text-white/50'}`}
          >
            Queue
          </button>
          <span className="text-white/15">·</span>
          <button
            onClick={() => setShowLyrics(true)}
            className={`font-medium transition-colors ${showLyrics ? 'text-white' : 'text-white/30 hover:text-white/50'}`}
          >
            Lyrics
          </button>
        </div>
        <button
          onClick={handleClose}
          className="ml-2 w-5 h-5 flex items-center justify-center text-white/30 hover:text-white hover:bg-red-500/50 rounded transition-colors"
          title="Close"
        >
          <X size={10} weight="bold" />
        </button>
      </div>

      {/* Main content */}
      <div className="flex items-start gap-2.5 px-3 pb-3 pt-1 flex-shrink-0">
        {/* Album Art */}
        <div className={`w-12 h-12 bg-neutral-900 rounded-lg overflow-hidden flex-shrink-0 border border-white/10 mt-0.5 ${isPlaying ? 'animate-pulse' : ''}`}>
          <img src={albumArt} className="w-full h-full object-cover" alt="" draggable={false} />
        </div>

        {/* Track info and controls */}
        <div className="flex-1 min-w-0 flex flex-col gap-1.5">
          <div className="min-w-0">
            <div className="text-[13px] font-medium text-white truncate leading-tight">{trackTitle}</div>
            <div className="text-[11px] text-white/50 truncate leading-tight">{trackArtist}</div>
          </div>

          {/* Progress bar */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-white/30 font-mono tabular-nums w-8">{formatTime(currentTime)}</span>
            <div
              ref={progressRef}
              className="flex-1 h-1 bg-white/10 rounded-full cursor-pointer group relative overflow-hidden"
              onMouseDown={handleProgressMouseDown}
            >
              <div className="absolute inset-y-0 left-0 bg-white/60 rounded-full group-hover:bg-white transition-colors" style={{ width: `${progress}%` }} />
            </div>
            <span className="text-[10px] text-white/30 font-mono tabular-nums w-8 text-right">{formatTime(duration)}</span>
          </div>

          {/* Controls */}
          <div className="flex items-center justify-center gap-1">
            <button onClick={() => sendCommand('previous')} className="w-8 h-8 flex items-center justify-center text-white/50 hover:text-white transition-colors rounded-full hover:bg-white/5">
              <ChromeIcon name="skip-backward" size={16} />
            </button>
            <button onClick={() => sendCommand('toggle')} className="w-10 h-10 flex items-center justify-center hover:scale-105 transition-transform">
              {isPlaying ? <ChromeIcon name="pause" size={24} /> : <ChromeIcon name="play" size={24} className="ml-0.5" />}
            </button>
            <button onClick={() => sendCommand('next')} className="w-8 h-8 flex items-center justify-center text-white/50 hover:text-white transition-colors rounded-full hover:bg-white/5">
              <ChromeIcon name="skip-forward" size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Bottom section: lyrics or up next */}
      <div className="flex-1 min-h-0 border-t border-white/5">
        {showLyrics ? (
          <div
            ref={lyricsRef}
            className="h-full overflow-y-auto no-scrollbar px-4 py-3 relative"
            onScroll={(e) => {
              const el = e.currentTarget;
              setLyricsScrolled(el.scrollTop > 40);
            }}
          >
            {isLoadingLyrics ? (
              <p className="text-xs text-white/30 text-center py-2">Loading lyrics...</p>
            ) : lyrics.length > 0 ? (
              <>
                <div className="space-y-1.5 pb-8">
                  {lyrics.map((lyric, i) => (
                    <p
                      key={i}
                      data-lyric={i}
                      className={`text-xs leading-relaxed cursor-pointer transition-colors ${
                        i === activeLyricIndex ? 'text-white font-medium' : 'text-white/25'
                      }`}
                      onClick={() => {
                        if (duration > 0 && isSyncedLyrics && lyric.time >= 0) {
                          sendCommand('seek', (lyric.time / duration) * 100);
                        }
                      }}
                    >
                      {lyric.text}
                    </p>
                  ))}
                </div>
                <button
                  onClick={() => {
                    lyricsRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="sticky bottom-2 float-right w-6 h-6 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center"
                >
                  <CaretUp size={10} weight="bold" className="text-white/60" />
                </button>
              </>
            ) : (
              <p className="text-xs text-white/20 text-center py-2">No lyrics available</p>
            )}
          </div>
        ) : (
          <div className="px-4 pt-1.5 pb-2">
            {upNext.length > 0 ? (
              <>
                <div className="text-[10px] text-white/30 uppercase tracking-wider font-bold mb-2">On Deck</div>
                <div className="space-y-1.5">
                  {upNext.map((track, i) => (
                    <div key={track.id || i} className="flex items-center gap-2.5 group">
                      <div className="w-7 h-7 rounded bg-neutral-800 overflow-hidden flex-shrink-0 border border-white/5">
                        {track.cover ? (
                          <img src={track.cover} className="w-full h-full object-cover" style={{ imageRendering: 'pixelated' }} alt="" draggable={false} />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <ChromeIcon name="music-note" size={10} className="opacity-30" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs text-white/60 truncate leading-tight">{track.title}</div>
                        <div className="text-[10px] text-white/30 truncate leading-tight">{track.artist}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="text-xs text-white/20 text-center py-2">Queue empty</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
