import React, { useState, useEffect, useRef, useCallback } from 'react';
import { CaretDown, ChatTeardropText } from '@phosphor-icons/react';
import { ChromeIcon } from './ChromeIcon';
import { useAudio } from '../context/AudioContext';
import { useServer } from '../context/ServerContext';
import { formatTime } from '../utils/formatTime';
import { AlbumArt } from './AlbumArt';
import { ArtistLink } from './ArtistLink';
import { fetchLyrics, findActiveLyricIndex, SyncedLyric } from '../services/lyrics';
import { PLACEHOLDER_COVER } from '../utils/placeholders';

interface FullScreenPlayerProps {
    onCollapse: () => void;
    onToast: (msg: string) => void;
    onNavigateToArtist?: (id: string) => void;
}

export const FullScreenPlayer: React.FC<FullScreenPlayerProps> = ({ onCollapse, onToast, onNavigateToArtist }) => {
    const {
        state, togglePlay, next, previous, seekPercent, playTrack,
        setVolume: setAudioVolume, toggleMute,
        isShuffled, repeatMode, toggleShuffle, cycleRepeat
    } = useAudio();
    const { queueTracks, api, toggleStar, starredTracks } = useServer();
    const { currentTrack, isPlaying, currentTime, duration, volume, isMuted } = state;

    // Lyrics state
    const [lyrics, setLyrics] = useState<SyncedLyric[]>([]);
    const [isSyncedLyrics, setIsSyncedLyrics] = useState(false);
    const [lyricsSource, setLyricsSource] = useState<'navidrome' | 'lrclib' | null>(null);
    const [isLoadingLyrics, setIsLoadingLyrics] = useState(false);
    const [activeLyricIndex, setActiveLyricIndex] = useState(0);
    const [isDraggingProgress, setIsDraggingProgress] = useState(false);
    const lyricsContainerRef = useRef<HTMLDivElement>(null);
    const progressRef = useRef<HTMLDivElement>(null);

    // Volume popup state
    const [showVolume, setShowVolume] = useState(false);
    const [isDraggingVolume, setIsDraggingVolume] = useState(false);
    const volumeSliderRef = useRef<HTMLDivElement>(null);
    const volumePopupRef = useRef<HTMLDivElement>(null);

    // Calculate progress percentage
    const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

    // Track info with fallbacks
    const trackTitle = currentTrack?.title || 'No Track';
    const trackArtist = currentTrack?.artist || 'Select a song';

    // Liked status
    const isLiked = currentTrack
        ? (currentTrack.liked || starredTracks.some(t => t.id === currentTrack.id))
        : false;

    // Fetch lyrics when track changes
    useEffect(() => {
        const loadLyrics = async () => {
            if (!currentTrack) {
                setLyrics([]);
                setIsSyncedLyrics(false);
                setLyricsSource(null);
                return;
            }

            setIsLoadingLyrics(true);
            setActiveLyricIndex(0);

            try {
                let durationSeconds = duration;
                if (durationSeconds <= 0 && currentTrack.duration) {
                    const parts = currentTrack.duration.split(':').map(Number);
                    if (parts.length === 2) {
                        durationSeconds = parts[0] * 60 + parts[1];
                    } else if (parts.length === 3) {
                        durationSeconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
                    }
                }

                const result = await fetchLyrics({
                    artist: currentTrack.artist,
                    title: currentTrack.title,
                    album: currentTrack.album,
                    duration: durationSeconds,
                    trackId: currentTrack.id,
                    navidromeFetcher: api ? (artist, title) => api.getLyrics(artist, title) : undefined,
                });

                if (result && result.lyrics.length > 0) {
                    setLyrics(result.lyrics);
                    setIsSyncedLyrics(result.isSynced);
                    setLyricsSource(result.source);
                } else {
                    setLyrics([]);
                    setIsSyncedLyrics(false);
                    setLyricsSource(null);
                }
            } catch (error) {
                console.error('Failed to fetch lyrics:', error);
                setLyrics([]);
                setIsSyncedLyrics(false);
                setLyricsSource(null);
            } finally {
                setIsLoadingLyrics(false);
            }
        };

        loadLyrics();
    }, [api, currentTrack?.id, duration]);

    // Update active lyric based on playback time — throttled to avoid
    // running findActiveLyricIndex on every currentTime change (4x/sec)
    const lastLyricCheckRef = useRef(0);
    useEffect(() => {
        if (lyrics.length === 0 || duration === 0) return;
        const now = performance.now();
        // Only re-check lyrics every 300ms — lyrics don't change faster than this
        if (now - lastLyricCheckRef.current < 300) return;
        lastLyricCheckRef.current = now;
        const newIndex = findActiveLyricIndex(lyrics, currentTime, isSyncedLyrics, duration);
        if (newIndex !== activeLyricIndex && newIndex >= 0) {
            setActiveLyricIndex(newIndex);
        }
    }, [currentTime, duration, lyrics, isSyncedLyrics]);

    // Scroll active lyric into view
    useEffect(() => {
        if (lyricsContainerRef.current && lyrics.length > 0) {
            const activeLine = lyricsContainerRef.current.querySelector(`[data-lyric-index="${activeLyricIndex}"]`);
            if (activeLine) {
                activeLine.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
    }, [activeLyricIndex, lyrics.length]);

    // Handle scrubber drag
    const calculateProgressFromEvent = useCallback((e: MouseEvent | React.MouseEvent, rect: DOMRect) => {
        const x = e.clientX - rect.left;
        const pct = (x / rect.width) * 100;
        seekPercent(Math.max(0, Math.min(100, pct)));
    }, [seekPercent]);

    const handleProgressMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDraggingProgress(true);
        const rect = e.currentTarget.getBoundingClientRect();
        calculateProgressFromEvent(e, rect);
    };

    useEffect(() => {
        if (!isDraggingProgress) return;
        const handleMouseMove = (e: MouseEvent) => {
            if (!progressRef.current) return;
            const rect = progressRef.current.getBoundingClientRect();
            calculateProgressFromEvent(e, rect);
        };
        const handleMouseUp = () => setIsDraggingProgress(false);
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDraggingProgress, calculateProgressFromEvent]);

    // Volume drag handlers
    const calculateVolumeFromEvent = useCallback((e: MouseEvent | React.MouseEvent, rect: DOMRect) => {
        const y = rect.bottom - e.clientY;
        const pct = Math.max(0, Math.min(1, y / rect.height));
        setAudioVolume(pct);
    }, [setAudioVolume]);

    const handleVolumeMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDraggingVolume(true);
        const rect = e.currentTarget.getBoundingClientRect();
        calculateVolumeFromEvent(e, rect);
    };

    useEffect(() => {
        if (!isDraggingVolume) return;
        const handleMouseMove = (e: MouseEvent) => {
            if (!volumeSliderRef.current) return;
            const rect = volumeSliderRef.current.getBoundingClientRect();
            calculateVolumeFromEvent(e, rect);
        };
        const handleMouseUp = () => setIsDraggingVolume(false);
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDraggingVolume, calculateVolumeFromEvent]);

    // Click outside to close volume popup
    useEffect(() => {
        if (!showVolume) return;
        const handleClickOutside = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (
                volumePopupRef.current && !volumePopupRef.current.contains(target) &&
                !target.closest('[data-volume-toggle]')
            ) {
                setShowVolume(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showVolume]);

    return (
        <div className="fixed inset-0 z-[200] flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-500">

            {/* Soft, colorful gradient base — lighter Apple Music inspired */}
            <div className="absolute inset-0 bg-gradient-to-br from-[#e4d4f0] via-[#d9c4ec] to-[#cfd4f5]" />

            {/* Vivid atmospheric orbs */}
            <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
                <div className="absolute top-[-15%] left-[-10%] w-[60vw] h-[60vw] bg-fuchsia-400/30 rounded-full blur-[80px] animate-[float_20s_ease-in-out_infinite] will-change-transform" />
                <div className="absolute bottom-[-10%] right-[-15%] w-[55vw] h-[55vw] bg-indigo-400/25 rounded-full blur-[80px] animate-[float_25s_ease-in-out_infinite_reverse] will-change-transform" />
                <div className="absolute top-[20%] right-[5%] w-[35vw] h-[35vw] bg-violet-400/25 rounded-full blur-[60px] animate-[float_18s_ease-in-out_infinite_2s] will-change-transform" />
                <div className="absolute bottom-[10%] left-[10%] w-[40vw] h-[40vw] bg-rose-400/20 rounded-full blur-[60px] animate-[float_22s_ease-in-out_infinite_4s] will-change-transform" />
            </div>

            {/* Collapse Button */}
            <button
                onClick={onCollapse}
                className="absolute top-6 left-6 z-50 p-3 rounded-full bg-white/40 backdrop-blur-md hover:bg-black/10 text-neutral-500 hover:text-neutral-800 transition-colors border border-white/30"
            >
                <CaretDown size={24} weight="bold" />
            </button>

            {/* Main two-column layout */}
            <div className="relative z-10 flex flex-1 min-h-0 pt-16 pb-4 px-8 gap-8">

                {/* LEFT COLUMN: Album art + track info + controls */}
                <div className="flex flex-col items-center w-[380px] flex-shrink-0 justify-center">
                    {/* Large square album art */}
                    <div className="w-[300px] h-[300px] rounded-2xl overflow-hidden flex-shrink-0 shadow-2xl shadow-black/15 border border-white/50">
                        <AlbumArt
                            serverCover={currentTrack?.cover}
                            artist={currentTrack?.artist}
                            album={currentTrack?.album}
                            trackId={currentTrack?.id}
                            className="w-full h-full object-cover"
                            alt="Now Playing"
                            onSaveCover={async () => { onToast('Cover saved from iTunes'); }}
                        />
                    </div>

                    {/* Track title + artist */}
                    <div className="mt-6 w-[300px] text-center">
                        <h1 className="text-xl font-bold text-neutral-900 truncate">{trackTitle}</h1>
                        <p className="text-sm text-neutral-500 truncate mt-1">
                            {currentTrack && onNavigateToArtist ? (
                                <ArtistLink
                                    artistName={currentTrack.artist}
                                    artistId={currentTrack.artistId}
                                    onNavigate={(id) => { onCollapse(); onNavigateToArtist(id); }}
                                    className="!text-neutral-500 !hover:text-neutral-800"
                                />
                            ) : trackArtist}
                        </p>
                    </div>

                    {/* Progress Scrubber */}
                    <div className="w-[300px] mt-5 group">
                        <div
                            ref={progressRef}
                            className={`w-full bg-neutral-900/10 rounded-full overflow-hidden cursor-pointer relative transition-all ${
                                isDraggingProgress ? 'h-2' : 'h-1.5'
                            }`}
                            onMouseDown={handleProgressMouseDown}
                        >
                            <div
                                className="h-full bg-neutral-800 rounded-full relative"
                                style={{ width: `${progress}%` }}
                            >
                                <div className={`absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-neutral-900 rounded-full shadow-lg transition-all ${
                                    isDraggingProgress ? 'opacity-100 scale-125' : 'opacity-0 group-hover:opacity-100'
                                }`} />
                            </div>
                        </div>
                        <div className="flex justify-between mt-1.5 text-[11px] font-mono text-neutral-400">
                            <span>{formatTime(currentTime)}</span>
                            <span>{formatTime(duration)}</span>
                        </div>
                    </div>

                    {/* Transport controls */}
                    <div className="flex items-center gap-6 mt-3">
                        <button onClick={previous} className="text-neutral-600 hover:text-neutral-900 transition-colors">
                            <ChromeIcon name="skip-backward" size={26} />
                        </button>
                        <button
                            onClick={togglePlay}
                            className="w-14 h-14 flex items-center justify-center hover:scale-105 transition-transform"
                        >
                            {isPlaying ? <ChromeIcon name="pause" size={34} /> : <ChromeIcon name="play" size={34} className="ml-0.5" />}
                        </button>
                        <button onClick={next} className="text-neutral-600 hover:text-neutral-900 transition-colors">
                            <ChromeIcon name="skip-forward" size={26} />
                        </button>
                    </div>

                    {/* Utility row */}
                    <div className="flex items-center gap-5 mt-4">
                        <button
                            onClick={toggleShuffle}
                            className={`transition-colors ${isShuffled ? 'text-purple-600' : 'text-neutral-400 hover:text-neutral-700'}`}
                            title={isShuffled ? 'Shuffle on' : 'Shuffle off'}
                        >
                            <ChromeIcon name="shuffle" size={18} />
                        </button>
                        <button
                            onClick={cycleRepeat}
                            className={`transition-colors relative ${repeatMode !== 'off' ? 'text-purple-600' : 'text-neutral-400 hover:text-neutral-700'}`}
                            title={`Repeat: ${repeatMode}`}
                        >
                            {repeatMode === 'one' ? <ChromeIcon name="repeat-one" size={18} /> : <ChromeIcon name="repeat" size={18} />}
                        </button>
                        <button
                            onClick={async () => {
                                if (!currentTrack) return;
                                const success = await toggleStar(currentTrack.id, 'song', isLiked);
                                if (success) {
                                    onToast(isLiked ? 'Removed from favorites' : 'Added to favorites');
                                }
                            }}
                            className={`transition-colors ${isLiked ? 'text-rose-500' : 'text-neutral-400 hover:text-neutral-700'}`}
                        >
                            <ChromeIcon name="heart" size={18} className={isLiked ? 'opacity-100' : 'opacity-60'} />
                        </button>
                        <button
                            data-volume-toggle
                            onClick={() => setShowVolume(v => !v)}
                            className={`transition-colors ${showVolume ? 'text-neutral-900' : 'text-neutral-400 hover:text-neutral-700'}`}
                        >
                            {isMuted ? <ChromeIcon name="volume-mute" size={18} /> : <ChromeIcon name="volume-high" size={18} />}
                        </button>
                    </div>
                </div>

                {/* RIGHT COLUMN: Lyrics */}
                <div className="flex-1 flex flex-col min-h-0 min-w-0">
                    <div
                        className="flex-1 relative overflow-hidden"
                        style={{
                            maskImage: 'linear-gradient(to bottom, transparent 0%, black 10%, black 88%, transparent 100%)',
                            WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 10%, black 88%, transparent 100%)',
                        }}
                    >
                        <div ref={lyricsContainerRef} className="h-full overflow-y-auto no-scrollbar space-y-5 py-20 pl-4">
                            {isLoadingLyrics ? (
                                <p className="text-3xl font-bold text-neutral-400">Loading lyrics...</p>
                            ) : lyrics.length > 0 ? (
                                <>
                                    {lyricsSource && (
                                        <p className="text-xs text-neutral-400 mb-4 uppercase tracking-wider">
                                            {lyricsSource === 'lrclib' ? 'via LRCLIB' : 'from server'}
                                            {isSyncedLyrics && ' \u2022 synced'}
                                        </p>
                                    )}
                                    {lyrics.map((lyric, i) => (
                                        <p
                                            key={i}
                                            data-lyric-index={i}
                                            className={`text-2xl lg:text-4xl font-bold cursor-pointer hover:opacity-100 transition-all duration-500 ${
                                                i === activeLyricIndex
                                                    ? 'text-neutral-900 scale-100'
                                                    : 'text-neutral-400/40 hover:text-neutral-600 blur-[1px] scale-[0.97]'
                                            }`}
                                            onClick={() => {
                                                if (duration > 0 && lyrics.length > 0) {
                                                    if (isSyncedLyrics && lyric.time >= 0) {
                                                        seekPercent((lyric.time / duration) * 100);
                                                    } else {
                                                        const timePerLine = duration / lyrics.length;
                                                        const seekTime = i * timePerLine;
                                                        seekPercent((seekTime / duration) * 100);
                                                    }
                                                }
                                            }}
                                        >
                                            {lyric.text}
                                        </p>
                                    ))}
                                </>
                            ) : (
                                <div className="flex flex-col items-start gap-4 pt-8 pl-4">
                                    <ChatTeardropText size={48} weight="light" className="text-neutral-300" />
                                    <p className="text-2xl font-bold text-neutral-400">No lyrics available</p>
                                    <p className="text-lg text-neutral-400/60">Lyrics not found for this track</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Up Next — fluid, no cards */}
                    <div className="flex-shrink-0 pt-4 pb-2">
                        <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-500 mb-3">Up Next</h3>
                        <div
                            className="flex gap-4 overflow-x-auto no-scrollbar pb-1"
                            style={{
                                maskImage: 'linear-gradient(to right, black 0%, black 80%, transparent 100%)',
                                WebkitMaskImage: 'linear-gradient(to right, black 0%, black 80%, transparent 100%)',
                            }}
                        >
                            {queueTracks.length > 0 ? (
                                queueTracks.map((track) => (
                                    <div
                                        key={track.id}
                                        className="flex-shrink-0 flex items-center gap-3 cursor-pointer group hover:bg-black/5 rounded-lg py-1.5 px-2 transition-colors"
                                        onClick={() => playTrack(track)}
                                    >
                                        <div className="w-9 h-9 overflow-hidden flex-shrink-0 shadow-md shadow-black/10">
                                            <img
                                                src={track.cover || PLACEHOLDER_COVER}
                                                className="w-full h-full object-cover"
                                                alt={track.title}
                                                loading="lazy"
                                            />
                                        </div>
                                        <div className="min-w-0 max-w-[140px]">
                                            <p className="text-sm font-medium text-neutral-700 group-hover:text-neutral-900 truncate transition-colors">{track.title}</p>
                                            <p className="text-[10px] text-neutral-400 truncate">
                                                {onNavigateToArtist ? (
                                                    <ArtistLink artistName={track.artist} artistId={track.artistId} onNavigate={onNavigateToArtist} />
                                                ) : track.artist}
                                            </p>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <p className="text-neutral-400 text-sm">Queue is empty</p>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Volume Popup */}
            <div
                ref={volumePopupRef}
                className={`absolute bottom-44 left-[340px] z-50 bg-white/60 backdrop-blur-xl border border-white/40 rounded-2xl p-4 flex flex-col items-center gap-3 shadow-xl transition-all duration-300 origin-bottom ${showVolume ? 'opacity-100 scale-100' : 'opacity-0 scale-90 pointer-events-none'}`}
            >
                <div
                    ref={volumeSliderRef}
                    className="h-32 w-1.5 bg-neutral-900/10 rounded-full relative cursor-pointer group"
                    onMouseDown={handleVolumeMouseDown}
                >
                    <div
                        className="absolute bottom-0 left-0 w-full bg-neutral-800 rounded-full group-hover:bg-purple-600 transition-colors pointer-events-none"
                        style={{ height: `${(isMuted ? 0 : volume) * 100}%` }}
                    />
                </div>
                <button onClick={toggleMute} className="text-neutral-500 hover:text-neutral-800 transition-colors">
                    {isMuted ? <ChromeIcon name="volume-mute" size={16} /> : <ChromeIcon name="volume-high" size={16} />}
                </button>
            </div>
        </div>
    );
};
