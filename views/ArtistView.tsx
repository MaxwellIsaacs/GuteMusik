import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { CircleNotch, CloudSlash } from '@phosphor-icons/react';
import { ChromeIcon } from '../components/ChromeIcon';
import { useServer } from '../context/ServerContext';
import { useAudio } from '../context/AudioContext';
import { Artist, Album, Track } from '../types';
import { ArtistImage } from '../components/ArtistImage';
import { ArtistLink } from '../components/ArtistLink';
import { categorizeArtists } from '../utils/artistParser';
import { useArtistInfo } from '../hooks/useArtistInfo';
import { useAlbumInfo } from '../hooks/useAlbumInfo';
import { SourceBadge } from '../components/SourceBadge';
import { PLACEHOLDER_COVER } from '../utils/placeholders';

// ═══════════════════════════════════════════════════════════════════════════════
// Hover Preview — large centered popup with albums + tracks in columns
// ═══════════════════════════════════════════════════════════════════════════════
interface ArtistPreviewProps {
    artistId: string;
    artistName: string;
    onPlayAlbum: (albumId: string) => void;
    onSelectAlbum: (albumId: string) => void;
    onPlayTrack: (track: Track, queue: Track[]) => void;
    onContextMenu: (e: React.MouseEvent, item: any, type: string) => void;
    onNavigate: (artistId: string) => void;
    onMouseEnter: () => void;
    onMouseLeave: () => void;
}

// Shared cache across re-renders / re-mounts
const previewCache: Record<string, { albums: Album[]; topTracks: Track[] }> = {};

const ArtistPreview: React.FC<ArtistPreviewProps> = ({ artistId, artistName, onPlayAlbum, onSelectAlbum, onPlayTrack, onContextMenu, onNavigate, onMouseEnter, onMouseLeave }) => {
    const { api } = useServer();
    const [albums, setAlbums] = useState<Album[]>([]);
    const [topTracks, setTopTracks] = useState<Track[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [sidebarWidth, setSidebarWidth] = useState(68);

    // Observe sidebar width changes so popup position stays centered in the content area
    useEffect(() => {
        const aside = document.querySelector('aside');
        if (!aside) return;
        setSidebarWidth(aside.getBoundingClientRect().width);
        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                setSidebarWidth(entry.contentRect.width);
            }
        });
        observer.observe(aside);
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        if (!api || !artistId) return;

        // Use cache if available
        if (previewCache[artistId]) {
            setAlbums(previewCache[artistId].albums);
            setTopTracks(previewCache[artistId].topTracks);
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        let cancelled = false;

        (async () => {
            try {
                const data = await api.getArtist(artistId);
                if (cancelled) return;

                // Sort albums by track count descending (proxy for popularity)
                const sorted = data.albums.slice().sort((a, b) => b.trackCount - a.trackCount);

                // Load tracks from the top album to show as "top tracks"
                let tracks: Track[] = [];
                if (sorted.length > 0) {
                    try {
                        const albumData = await api.getAlbum(sorted[0].id);
                        if (!cancelled) tracks = albumData.tracks.slice(0, 5);
                    } catch {}
                }

                if (!cancelled) {
                    previewCache[artistId] = { albums: sorted, topTracks: tracks };
                    setAlbums(sorted);
                    setTopTracks(tracks);
                }
            } catch {}
            finally { if (!cancelled) setIsLoading(false); }
        })();

        return () => { cancelled = true; };
    }, [api, artistId]);

    const previewAlbums = albums.slice(0, 6);

    // Calculate right position: center popup within the content area (viewport minus sidebar minus padding)
    // Layout: 16px padding + sidebar + 24px gap + [content area] + 16px padding
    const contentLeft = 16 + sidebarWidth + 24;
    const contentRight = 16;
    const contentWidth = typeof window !== 'undefined' ? window.innerWidth - contentLeft - contentRight : 800;
    // Place the popup's right edge ~8% from the right of the content area
    const popupRight = contentRight + contentWidth * 0.08;

    return (
        <div
            className="artist-preview-popup fixed z-40 pointer-events-auto"
            style={{
                right: popupRight,
                top: '50%',
                transform: 'translateY(-50%)',
            }}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
        >
            <div className="artist-preview-card rounded-2xl px-9 py-8 w-[560px] max-h-[75vh] overflow-y-auto no-scrollbar">
                {/* Header */}
                <div className="flex items-baseline justify-between mb-6">
                    <h3
                        className="text-white text-xl font-light truncate"
                        style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
                    >
                        {artistName}
                    </h3>
                    <button
                        onClick={(e) => { e.stopPropagation(); onNavigate(artistId); }}
                        className="text-[10px] font-mono uppercase tracking-wider text-white/30 hover:text-white/70 transition-colors flex-shrink-0 ml-4"
                    >
                        View artist
                    </button>
                </div>

                {isLoading ? (
                    <div className="flex items-center justify-center py-16">
                        <CircleNotch size={18} weight="light" className="animate-spin text-white/20" />
                    </div>
                ) : (
                    <div className="flex gap-8">
                        {/* Left column — Top tracks */}
                        {topTracks.length > 0 && (
                            <div className="flex-1 min-w-0">
                                <span className="text-[9px] font-mono uppercase tracking-[0.2em] text-white/25 mb-4 block">Tracks</span>
                                <div className="space-y-0.5">
                                    {topTracks.map((track, i) => (
                                        <button
                                            key={track.id}
                                            onClick={(e) => { e.stopPropagation(); onPlayTrack(track, topTracks); }}
                                            onContextMenu={(e) => { e.stopPropagation(); onContextMenu(e, track, 'Track'); }}
                                            className="w-full flex items-center gap-3 py-2 px-2 text-left group/track hover:bg-white/[0.06] rounded-lg transition-colors"
                                        >
                                            <span className="text-[10px] font-mono w-4 text-right text-white/20 flex-shrink-0">
                                                {String(i + 1).padStart(2, '0')}
                                            </span>
                                            <span className="text-white/70 text-[13px] truncate flex-1 group-hover/track:text-white transition-colors">{track.title}</span>
                                            <span className="text-[10px] font-mono text-white/20 flex-shrink-0">{track.duration}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Right column — Albums */}
                        <div className={topTracks.length > 0 ? "w-[190px] flex-shrink-0" : "flex-1"}>
                            <span className="text-[9px] font-mono uppercase tracking-[0.2em] text-white/25 mb-4 block">Albums</span>
                            <div className="space-y-1">
                                {previewAlbums.map(album => (
                                    <div
                                        key={album.id}
                                        className="flex items-center gap-3 group/album cursor-pointer py-1.5 hover:bg-white/[0.06] rounded-lg px-2 -mx-2 transition-colors"
                                        onClick={(e) => { e.stopPropagation(); onSelectAlbum(album.id); }}
                                    >
                                        <img
                                            src={album.cover}
                                            alt={album.title}
                                            className="w-10 h-10 object-cover flex-shrink-0 rounded-md"
                                            onError={(e) => { (e.target as HTMLImageElement).src = PLACEHOLDER_COVER; }}
                                        />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-white/70 text-[13px] truncate leading-tight group-hover/album:text-white transition-colors">{album.title}</p>
                                            <p className="text-white/25 text-[10px] font-mono mt-0.5">{album.year || ''}</p>
                                        </div>
                                        <button
                                            className="opacity-0 group-hover/album:opacity-100 transition-opacity flex-shrink-0 text-white/50 hover:text-white"
                                            onClick={(e) => { e.stopPropagation(); onPlayAlbum(album.id); }}
                                        >
                                            <ChromeIcon name="play" size={11} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};


// ═══════════════════════════════════════════════════════════════════════════════
// Inline Album Card — horizontal filmstrip item (detail page)
// ═══════════════════════════════════════════════════════════════════════════════
interface AlbumCardProps {
    album: Album;
    artistName: string;
    isPlaying: boolean;
    onPlay: () => void;
    onSelect: () => void;
    isExpanded: boolean;
    onToggle: () => void;
    tracks: Track[];
    isLoadingTracks: boolean;
    onPlayTrack?: (track: Track, queue?: Track[]) => void;
    currentTrackId?: string;
}

const AlbumCard: React.FC<AlbumCardProps> = ({
    album, artistName, isPlaying, onPlay, onSelect, isExpanded, onToggle, tracks, isLoadingTracks, onPlayTrack, currentTrackId
}) => {
    const { info } = useAlbumInfo(artistName, album.title);

    return (
        <div className="album-card-item group">
            {/* Cover */}
            <div
                className="relative cursor-pointer overflow-hidden aspect-square w-full"
                onClick={onSelect}
                onContextMenu={(e) => { e.preventDefault(); onToggle(); }}
            >
                <img
                    src={album.cover}
                    alt={album.title}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                    onError={(e) => { (e.target as HTMLImageElement).src = PLACEHOLDER_COVER; }}
                />
                {isPlaying && (
                    <div className="absolute top-3 left-3 w-2 h-2 rounded-full bg-white animate-pulse" />
                )}
                {/* Hover play */}
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    <button
                        onClick={(e) => { e.stopPropagation(); onPlay(); }}
                        className="w-10 h-10 rounded-full bg-white/90 flex items-center justify-center hover:scale-110 transition-transform"
                    >
                        <ChromeIcon name="play" size={16} className="ml-0.5" />
                    </button>
                </div>
            </div>

            {/* Meta below cover */}
            <div className="mt-3">
                <h4
                    className="text-white text-sm font-normal leading-snug cursor-pointer hover:text-white/70 transition-colors truncate"
                    onClick={onSelect}
                >
                    {album.title}
                </h4>
                <p className="text-white/30 text-xs mt-1 flex items-center gap-2">
                    {album.year && <span>{album.year}</span>}
                    {album.year && album.trackCount && <span className="text-white/10">|</span>}
                    <span>{album.trackCount} tracks</span>
                    {info?.releaseType && info.releaseType !== 'Album' && (
                        <>
                            <span className="text-white/10">|</span>
                            <span className="uppercase text-[10px] tracking-wider">{info.releaseType}</span>
                        </>
                    )}
                </p>
            </div>

            {/* Expanded tracklist */}
            {isExpanded && (
                <div className="mt-4 space-y-0.5">
                    {isLoadingTracks ? (
                        <div className="flex items-center gap-2 py-4">
                            <CircleNotch size={14} weight="light" className="animate-spin text-white/30" />
                            <span className="text-xs text-white/30">Loading tracks...</span>
                        </div>
                    ) : (
                        tracks.map((track, i) => {
                            const isCurrent = currentTrackId === track.id;
                            return (
                                <button
                                    key={track.id}
                                    onClick={() => onPlayTrack?.(track, tracks)}
                                    className={`w-full flex items-center gap-3 py-1.5 px-1 text-left group/track hover:bg-white/[0.04] rounded transition-colors ${isCurrent ? 'text-white' : 'text-white/50'}`}
                                >
                                    <span className={`text-[10px] font-mono w-5 text-right flex-shrink-0 ${isCurrent ? 'text-white' : 'text-white/20'}`}>
                                        {isCurrent ? <span className="inline-block w-1.5 h-1.5 rounded-full bg-white" /> : String(i + 1).padStart(2, '0')}
                                    </span>
                                    <span className="text-xs truncate flex-1">{track.title}</span>
                                    <span className="text-[10px] font-mono text-white/20 flex-shrink-0">{track.duration}</span>
                                </button>
                            );
                        })
                    )}
                </div>
            )}
        </div>
    );
};


interface ArtistViewProps {
    artistId?: string;
    onSelectArtist: (id: string | undefined) => void;
    onSelectAlbum?: (id: string) => void;
    onPlayTrack?: (track: Track, queue?: Track[]) => void;
    onContextMenu?: (e: React.MouseEvent, item: any, type: string) => void;
    onToast: (m: string) => void;
}

type ArtistFilter = 'all' | 'solo' | 'collabs';

export const ArtistView: React.FC<ArtistViewProps> = ({ artistId, onSelectArtist, onSelectAlbum, onPlayTrack, onContextMenu, onToast }) => {
    const { state, api, artists, isLoadingArtists, toggleStar } = useServer();
    const { state: audioState } = useAudio();
    const [artistAlbums, setArtistAlbums] = useState<Album[]>([]);
    const [albumTracks, setAlbumTracks] = useState<Record<string, Track[]>>({});
    const [selectedArtist, setSelectedArtist] = useState<Artist | null>(null);
    const [isLoadingArtist, setIsLoadingArtist] = useState(false);
    const [artistFilter, setArtistFilter] = useState<ArtistFilter>('all');
    const [showFilterDropdown, setShowFilterDropdown] = useState(false);
    const [imageLoaded, setImageLoaded] = useState(false);
    const [expandedAlbum, setExpandedAlbum] = useState<string | null>(null);
    const [loadingTracks, setLoadingTracks] = useState<string | null>(null);
    const [isLiked, setIsLiked] = useState(false);
    const [viewMode, setViewMode] = useState<'list' | 'abc'>('list');
    const [activeLetter, setActiveLetter] = useState<string | null>(null);
    const [filterLetter, setFilterLetter] = useState<string | null>(null);
    const [hoveredArtist, setHoveredArtist] = useState<string | null>(null);
    const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [previewArtistId, setPreviewArtistId] = useState<string | null>(null);
    const isOverPopupRef = useRef(false);
    const contextMenuOpenRef = useRef(false);
    const filterRef = useRef<HTMLDivElement>(null);
    const letterRefs = useRef<Record<string, HTMLDivElement | null>>({});
    const [showFullBio, setShowFullBio] = useState(false);

    // Get artist name for multi-source lookup (must be called unconditionally)
    const artistForInfo = selectedArtist || artists.find(a => a.id === artistId);
    const { info: artistInfo, source: artistInfoSource, isLoading: isLoadingInfo } = useArtistInfo(artistForInfo?.name);

    const categorizedArtists = useMemo(() => categorizeArtists(artists), [artists]);

    const filteredArtists = useMemo(() => {
        switch (artistFilter) {
            case 'solo': return categorizedArtists.singleArtists;
            case 'collabs': return categorizedArtists.multiArtists;
            default: return categorizedArtists.all;
        }
    }, [categorizedArtists, artistFilter]);

    // Get available letters from artist names
    const availableLetters = useMemo(() => {
        const letters = new Set<string>();
        filteredArtists.forEach(a => {
            const first = a.name.charAt(0).toUpperCase();
            letters.add(/[A-Z]/.test(first) ? first : '#');
        });
        return letters;
    }, [filteredArtists]);

    // Group artists by first letter
    const groupedArtists = useMemo(() => {
        let artistsToGroup = filterLetter
            ? filteredArtists.filter(a => {
                const first = a.name.charAt(0).toUpperCase();
                return filterLetter === '#' ? !/[A-Z]/.test(first) : first === filterLetter;
              })
            : filteredArtists;

        const groups: Record<string, typeof artistsToGroup> = {};
        artistsToGroup.forEach(a => {
            const first = a.name.charAt(0).toUpperCase();
            const key = /[A-Z]/.test(first) ? first : '#';
            if (!groups[key]) groups[key] = [];
            groups[key].push(a);
        });
        return groups;
    }, [filteredArtists, filterLetter]);

    const sortedLetters = Object.keys(groupedArtists).sort((a, b) => {
        if (a === '#') return 1;
        if (b === '#') return -1;
        return a.localeCompare(b);
    });

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
                setShowFilterDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        if (artistId && api) {
            setIsLoadingArtist(true);
            setAlbumTracks({});
            setExpandedAlbum(null);
            api.getArtist(artistId)
                .then(data => {
                    setSelectedArtist(data.artist);
                    setArtistAlbums(data.albums);
                })
                .catch(err => {
                    console.error('Failed to load artist:', err);
                    onToast('Failed to load artist');
                })
                .finally(() => setIsLoadingArtist(false));
        } else {
            setArtistAlbums([]);
            setSelectedArtist(null);
        }
    }, [artistId, api, onToast]);

    useEffect(() => {
        setImageLoaded(false);
        const timer = setTimeout(() => setImageLoaded(true), 100);
        return () => clearTimeout(timer);
    }, [artistId]);

    // Scroll tracking with IntersectionObserver for ABC view
    useEffect(() => {
        if (artistId || viewMode !== 'abc') return;

        let pendingLetter: string | undefined;
        let rafId: number | null = null;

        const handleIntersect = (entries: IntersectionObserverEntry[]) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const letter = entry.target.getAttribute('data-letter');
                    if (letter) pendingLetter = letter;
                }
            });
            if (pendingLetter !== undefined && rafId === null) {
                rafId = requestAnimationFrame(() => {
                    rafId = null;
                    if (pendingLetter !== undefined) {
                        setActiveLetter(pendingLetter);
                        pendingLetter = undefined;
                    }
                });
            }
        };

        const observer = new IntersectionObserver(handleIntersect, {
            rootMargin: '-20% 0px -70% 0px',
            threshold: 0
        });

        Object.entries(letterRefs.current).forEach(([, el]) => {
            if (el) observer.observe(el);
        });

        return () => {
            observer.disconnect();
            if (rafId !== null) cancelAnimationFrame(rafId);
        };
    }, [artistId, viewMode, sortedLetters]);

    // Letter click handlers
    const handleLetterClick = (letter: string) => {
        letterRefs.current[letter]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    const handleLetterDoubleClick = (letter: string) => {
        setFilterLetter(prev => prev === letter ? null : letter);
    };

    // Dismiss preview helper
    const dismissPreview = useCallback(() => {
        setPreviewArtistId(null);
        isOverPopupRef.current = false;
    }, []);

    // Hover handlers — debounce preview popup, persist when over popup
    const handleRowMouseEnter = useCallback((id: string, _el: HTMLElement) => {
        // Clear any pending dismiss
        if (dismissTimerRef.current) {
            clearTimeout(dismissTimerRef.current);
            dismissTimerRef.current = null;
        }

        setHoveredArtist(id);

        // If hovering a new artist, switch immediately (or after debounce if first)
        if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
        hoverTimerRef.current = setTimeout(() => {
            setPreviewArtistId(id);
        }, previewArtistId ? 150 : 300);
    }, [previewArtistId]);

    const handleRowMouseLeave = useCallback(() => {
        setHoveredArtist(null);
        if (hoverTimerRef.current) {
            clearTimeout(hoverTimerRef.current);
            hoverTimerRef.current = null;
        }

        // Delay dismiss to allow mouse to travel to popup
        dismissTimerRef.current = setTimeout(() => {
            if (!isOverPopupRef.current && !contextMenuOpenRef.current) {
                dismissPreview();
            }
        }, 200);
    }, [dismissPreview]);

    const handlePopupMouseEnter = useCallback(() => {
        isOverPopupRef.current = true;
        if (dismissTimerRef.current) {
            clearTimeout(dismissTimerRef.current);
            dismissTimerRef.current = null;
        }
    }, []);

    const handlePopupMouseLeave = useCallback(() => {
        isOverPopupRef.current = false;
        // Don't dismiss if context menu is open
        if (contextMenuOpenRef.current) return;
        dismissTimerRef.current = setTimeout(() => {
            if (!isOverPopupRef.current && !contextMenuOpenRef.current) {
                dismissPreview();
            }
        }, 200);
    }, [dismissPreview]);

    // Track context menu open/close — keep popup alive while menu is open
    const handlePreviewContextMenu = useCallback((e: React.MouseEvent, item: any, type: string) => {
        contextMenuOpenRef.current = true;
        onContextMenu?.(e, item, type);

        // Listen for the context menu closing (any click or contextmenu elsewhere)
        const closeListener = () => {
            // Small delay so the action can process before we check dismiss
            setTimeout(() => {
                contextMenuOpenRef.current = false;
                // Now check if we should dismiss the popup
                if (!isOverPopupRef.current) {
                    dismissTimerRef.current = setTimeout(() => {
                        if (!isOverPopupRef.current && !contextMenuOpenRef.current) {
                            dismissPreview();
                        }
                    }, 300);
                }
            }, 100);
            document.removeEventListener('click', closeListener);
            document.removeEventListener('contextmenu', closeListener);
        };

        // Wait a tick so this click doesn't immediately fire the listener
        requestAnimationFrame(() => {
            document.addEventListener('click', closeListener);
            document.addEventListener('contextmenu', closeListener);
        });
    }, [onContextMenu, dismissPreview]);

    // Dismiss preview on scroll
    useEffect(() => {
        if (!previewArtistId) return;

        const scrollContainer = document.querySelector('.overflow-y-auto');
        if (!scrollContainer) return;

        const handleScroll = () => {
            dismissPreview();
            setHoveredArtist(null);
            if (hoverTimerRef.current) {
                clearTimeout(hoverTimerRef.current);
                hoverTimerRef.current = null;
            }
        };

        scrollContainer.addEventListener('scroll', handleScroll, { passive: true });
        return () => scrollContainer.removeEventListener('scroll', handleScroll);
    }, [previewArtistId, dismissPreview]);

    // Cleanup timers
    useEffect(() => {
        return () => {
            if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
            if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
        };
    }, []);

    // Play album from preview (fetches tracks then plays)
    const playAlbumFromPreview = useCallback(async (albumId: string) => {
        if (!api || !onPlayTrack) return;
        try {
            const data = await api.getAlbum(albumId);
            if (data.tracks.length > 0) {
                onPlayTrack(data.tracks[0], data.tracks);
                onToast(`Playing ${data.album?.title || 'album'}`);
            }
        } catch (err) {
            console.error('Failed to play album:', err);
        }
    }, [api, onPlayTrack, onToast]);

    // Load tracks for an album
    const loadAlbumTracks = async (albumId: string) => {
        if (albumTracks[albumId]) return albumTracks[albumId];
        if (!api) return [];

        setLoadingTracks(albumId);
        try {
            const data = await api.getAlbum(albumId);
            setAlbumTracks(prev => ({ ...prev, [albumId]: data.tracks }));
            return data.tracks;
        } catch (err) {
            console.error('Failed to load tracks:', err);
            return [];
        } finally {
            setLoadingTracks(null);
        }
    };

    // Play all tracks from artist
    const playAllTracks = async () => {
        if (!onPlayTrack || artistAlbums.length === 0) return;

        const allTracks: Track[] = [];
        for (const album of artistAlbums) {
            const tracks = await loadAlbumTracks(album.id);
            allTracks.push(...tracks);
        }

        if (allTracks.length > 0) {
            onPlayTrack(allTracks[0], allTracks);
            onToast(`Playing ${allTracks.length} tracks`);
        }
    };

    // Shuffle all tracks
    const shuffleAllTracks = async () => {
        if (!onPlayTrack || artistAlbums.length === 0) return;

        const allTracks: Track[] = [];
        for (const album of artistAlbums) {
            const tracks = await loadAlbumTracks(album.id);
            allTracks.push(...tracks);
        }

        if (allTracks.length > 0) {
            const shuffled = [...allTracks].sort(() => Math.random() - 0.5);
            onPlayTrack(shuffled[0], shuffled);
            onToast(`Shuffling ${shuffled.length} tracks`);
        }
    };

    // Play album
    const playAlbum = async (albumId: string, e?: React.MouseEvent) => {
        e?.stopPropagation();
        if (!onPlayTrack) return;

        const tracks = await loadAlbumTracks(albumId);
        if (tracks.length > 0) {
            onPlayTrack(tracks[0], tracks);
            const album = artistAlbums.find(a => a.id === albumId);
            onToast(`Playing ${album?.title}`);
        }
    };

    // Toggle album expansion to show tracks
    const toggleAlbumExpand = async (albumId: string) => {
        if (expandedAlbum === albumId) {
            setExpandedAlbum(null);
        } else {
            await loadAlbumTracks(albumId);
            setExpandedAlbum(albumId);
        }
    };

    if (!state.isConnected) {
        return (
            <div className="animate-fade-in pb-40 flex flex-col items-center justify-center min-h-[60vh]">
                <CloudSlash size={64} weight="light" className="text-white/20 mb-6" />
                <h2 className="text-2xl font-bold text-white/60 mb-2">Not Connected</h2>
                <p className="text-white/40 text-sm">Connect to your server in Settings.</p>
            </div>
        );
    }

    // ══════════════════════════════════════════════════════════════════════════════
    // INDEX VIEW — Typographic list with hover preview popup
    // ══════════════════════════════════════════════════════════════════════════════
    if (!artistId) {
        if (isLoadingArtists && artists.length === 0) {
            return (
                <div className="animate-fade-in pb-40 flex flex-col items-center justify-center min-h-[60vh]">
                    <CircleNotch size={48} weight="light" className="text-white/40 animate-spin mb-4" />
                    <p className="text-white/40 text-sm">Loading artists...</p>
                </div>
            );
        }

        const alphabet = ['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z','#'];

        // Resolve active artist for background wash (use hoveredArtist for instant bg, fall back to preview)
        const bgArtistId = hoveredArtist || previewArtistId;
        const bgEntry = bgArtistId ? filteredArtists.find(a => a.id === bgArtistId) : null;

        // Render a single artist row — shared between list & ABC views
        const renderArtistRow = (entry: typeof filteredArtists[0], idx: number) => {
            const isHovered = hoveredArtist === entry.id;
            return (
                <div
                    key={entry.id}
                    onClick={() => onSelectArtist(entry.id)}
                    onMouseEnter={(e) => handleRowMouseEnter(entry.id, e.currentTarget)}
                    onMouseLeave={handleRowMouseLeave}
                    className="artist-row group cursor-pointer border-b border-white/[0.04] last:border-b-0"
                    style={{
                        opacity: 0,
                        animation: `fade-in 0.3s ease forwards`,
                        animationDelay: `${Math.min(idx * 15, 600)}ms`,
                    }}
                >
                    <div className="flex items-baseline justify-between py-3 px-1">
                        <h3
                            className={`artist-name-type text-[clamp(1.1rem,2.5vw,1.6rem)] font-light leading-tight transition-colors duration-200 ${
                                isHovered ? 'text-white' : 'text-white/60'
                            }`}
                            style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
                        >
                            {entry.name}
                        </h3>
                        <span className={`text-[10px] font-mono tracking-wider transition-colors duration-200 flex-shrink-0 ml-6 ${
                            isHovered ? 'text-white/40' : 'text-white/15'
                        }`}>
                            {entry.albumCount} {entry.albumCount === 1 ? 'album' : 'albums'}
                        </span>
                    </div>
                </div>
            );
        };

        return (
            <div className="animate-fade-in pb-40 relative">
                {/* Background artist image wash — subtle, appears on hover */}
                {bgEntry && (
                    <div className="artist-bg-wash fixed inset-0 z-0 pointer-events-none">
                        <ArtistImage
                            artistName={bgEntry.parseResult.primaryArtist}
                            className="w-full h-full object-cover"
                            style={{ objectPosition: 'center 30%' }}
                            alt=""
                        />
                        {/* Darken just enough to keep text readable */}
                        <div className="absolute inset-0 bg-black/50" />
                        {/* Bottom fade into page bg */}
                        <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-transparent to-transparent" />
                        {/* Left fade so artist list text is legible */}
                        <div className="absolute inset-0 bg-gradient-to-r from-[#050505]/60 via-transparent to-transparent" />
                    </div>
                )}

                {/* Hover preview popup */}
                {previewArtistId && (() => {
                    const previewEntry = filteredArtists.find(a => a.id === previewArtistId);
                    if (!previewEntry) return null;
                    return (
                        <ArtistPreview
                            artistId={previewArtistId}
                            artistName={previewEntry.name}
                            onPlayAlbum={playAlbumFromPreview}
                            onSelectAlbum={(id) => onSelectAlbum?.(id)}
                            onPlayTrack={(track, queue) => { onPlayTrack?.(track, queue); onToast(`Playing ${track.title}`); }}
                            onContextMenu={handlePreviewContextMenu}
                            onNavigate={onSelectArtist}
                            onMouseEnter={handlePopupMouseEnter}
                            onMouseLeave={handlePopupMouseLeave}
                        />
                    );
                })()}

                <div className="relative z-10">
                    {/* Header */}
                    <header className="flex items-end justify-between mb-12 sticky top-0 z-20 py-4 mix-blend-difference select-none">
                        <div>
                            <h1 className="text-7xl font-medium tracking-tighter text-white mb-2">Artists</h1>
                            <p className="text-white/50 text-sm tracking-wide font-mono flex items-center gap-3">
                                <span>{filteredArtists.length} PROFILES</span>
                                {filterLetter && (
                                    <>
                                        <span className="w-1 h-1 rounded-full bg-white/30"></span>
                                        <button onClick={() => setFilterLetter(null)} className="hover:text-white">
                                            {filterLetter} ✕
                                        </button>
                                    </>
                                )}
                            </p>
                        </div>
                        <div className="flex items-center gap-2" ref={filterRef}>
                            <button
                                onClick={() => { setArtistFilter('all'); setShowFilterDropdown(false); }}
                                className={`px-6 py-2 rounded-full border text-xs font-bold uppercase transition-colors ${
                                    artistFilter === 'all'
                                        ? 'border-white/20 bg-white text-black'
                                        : 'border-white/10 bg-transparent text-white/50 hover:text-white hover:border-white/40'
                                }`}
                            >
                                All
                            </button>
                            <button
                                onClick={() => setShowFilterDropdown(!showFilterDropdown)}
                                className={`px-6 py-2 rounded-full border text-xs font-bold uppercase transition-colors ${
                                    artistFilter !== 'all' || viewMode === 'abc'
                                        ? 'border-white/20 bg-white text-black'
                                        : 'border-white/10 bg-transparent text-white/50 hover:text-white hover:border-white/40'
                                }`}
                            >
                                {artistFilter === 'all' && viewMode === 'list' ? 'Filter' : artistFilter === 'solo' ? 'Single' : artistFilter === 'collabs' ? 'Multi' : viewMode === 'abc' ? 'ABC' : 'Filter'}
                            </button>
                            {showFilterDropdown && (
                                <>
                                    <div className="w-px h-6 bg-white/10 mx-1" />
                                    <button
                                        onClick={() => { setArtistFilter('solo'); setShowFilterDropdown(false); }}
                                        className={`px-5 py-2 rounded-full text-xs font-bold uppercase transition-colors ${
                                            artistFilter === 'solo' ? 'bg-white text-black' : 'bg-white/10 text-white/70 hover:bg-white/20 hover:text-white'
                                        }`}
                                    >
                                        Single
                                    </button>
                                    <button
                                        onClick={() => { setArtistFilter('collabs'); setShowFilterDropdown(false); }}
                                        className={`px-5 py-2 rounded-full text-xs font-bold uppercase transition-colors ${
                                            artistFilter === 'collabs' ? 'bg-white text-black' : 'bg-white/10 text-white/70 hover:bg-white/20 hover:text-white'
                                        }`}
                                    >
                                        Multi
                                    </button>
                                    <button
                                        onClick={() => { setViewMode(viewMode === 'abc' ? 'list' : 'abc'); setShowFilterDropdown(false); }}
                                        className={`px-5 py-2 rounded-full text-xs font-bold uppercase transition-colors ${
                                            viewMode === 'abc' ? 'bg-white text-black' : 'bg-white/10 text-white/70 hover:bg-white/20 hover:text-white'
                                        }`}
                                    >
                                        ABC
                                    </button>
                                </>
                            )}
                        </div>
                    </header>

                    {/* A-Z rail — thin, right edge, only in ABC view */}
                    {viewMode === 'abc' && (
                        <div className="fixed right-3 top-1/2 -translate-y-1/2 z-50 flex flex-col items-center">
                            {alphabet.map((letter) => {
                                const hasArtists = availableLetters.has(letter);
                                const isActive = activeLetter === letter;
                                const isFiltered = filterLetter === letter;

                                return (
                                    <button
                                        key={letter}
                                        onClick={() => handleLetterClick(letter)}
                                        onDoubleClick={() => handleLetterDoubleClick(letter)}
                                        className={`w-5 h-[18px] text-[9px] font-mono flex items-center justify-center transition-colors duration-100
                                            ${isFiltered ? 'bg-white text-black rounded-sm' : ''}
                                            ${isActive && !isFiltered ? 'text-white' : ''}
                                            ${hasArtists && !isActive && !isFiltered ? 'text-white/30 hover:text-white/70' : ''}
                                            ${!hasArtists ? 'text-white/[0.08]' : ''}
                                        `}
                                    >
                                        {letter}
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {/* Artist List */}
                    {filteredArtists.length === 0 ? (
                        <div className="flex flex-col items-center justify-center min-h-[40vh]">
                            <p className="text-white/40 text-sm">No artists found.</p>
                        </div>
                    ) : viewMode === 'list' ? (
                        /* Clean typographic list */
                        <div className="max-w-3xl">
                            {filteredArtists.map((entry, idx) => renderArtistRow(entry, idx))}
                        </div>
                    ) : (
                        /* ABC grouped — same typographic list, with letter headers */
                        <div className="max-w-3xl pr-8">
                            {sortedLetters.map(letter => (
                                <div
                                    key={letter}
                                    ref={el => { letterRefs.current[letter] = el; }}
                                    data-letter={letter}
                                    className="mb-10"
                                >
                                    <div className="sticky top-20 z-10 mb-2 flex items-center gap-4">
                                        <span className="text-5xl font-extralight text-white/[0.08] leading-none">{letter}</span>
                                        <div className="flex-1 h-px bg-white/[0.04]" />
                                    </div>
                                    {groupedArtists[letter]?.map((entry, idx) => renderArtistRow(entry, idx))}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // ══════════════════════════════════════════════════════════════════════════════
    // DETAIL VIEW — Name left, portrait right, editorial scroll
    // ══════════════════════════════════════════════════════════════════════════════
    const artist = artistForInfo;

    if (isLoadingArtist) {
        return (
            <div className="animate-fade-in pb-40 flex flex-col items-center justify-center min-h-[60vh]">
                <CircleNotch size={32} weight="light" className="text-white/40 animate-spin" />
            </div>
        );
    }

    if (!artist) {
        return (
            <div className="animate-fade-in pb-40 flex flex-col items-center justify-center min-h-[60vh]">
                <p className="text-white/40 text-sm">Artist not found.</p>
            </div>
        );
    }

    const totalTracks = artistAlbums.reduce((acc, a) => acc + (a.trackCount || 0), 0);
    const currentlyPlayingAlbum = audioState.currentTrack ? artistAlbums.find(a =>
        albumTracks[a.id]?.some(t => t.id === audioState.currentTrack?.id)
    ) : null;

    // Get years active
    const years = artistAlbums.map(a => a.year).filter(Boolean).sort();
    const firstYear = years[0];
    const lastYear = years[years.length - 1];
    const yearsActive = firstYear && lastYear && firstYear !== lastYear
        ? `${firstYear}–${lastYear}`
        : firstYear || null;

    const sortedAlbums = artistAlbums
        .slice()
        .sort((a, b) => parseInt(a.year || '0') - parseInt(b.year || '0'));

    return (
        <div className="artist-detail-view animate-fade-in -mx-10 -mt-4 pb-40">
            {/* ═══════════════ HERO — Art + Info side by side (matching album page) ═══════════════ */}
            <div className="px-10 lg:px-14 pt-8 pb-12">
                <div className="flex gap-10 lg:gap-14 items-start">
                    {/* Artist photo — portrait, prominent */}
                    <div className="flex-shrink-0">
                        <div className="w-64 h-80 lg:w-80 lg:h-[400px] xl:w-96 xl:h-[480px] overflow-hidden shadow-2xl shadow-black/50 relative">
                            <ArtistImage
                                artistName={artist.name}
                                className={`w-full h-full object-cover object-top transition-opacity duration-700 ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
                                alt={artist.name}
                            />
                        </div>
                    </div>

                    {/* Artist metadata — breathes alongside the photo */}
                    <div className="flex-1 min-w-0 pt-4 lg:pt-8">
                        {/* Tiny metadata crumbs — matching album page style */}
                        <div className="flex items-center gap-2.5 mb-5 flex-wrap">
                            <span className="text-[10px] font-mono tracking-wider text-white/25">{artistAlbums.length} albums</span>
                            <span className="w-0.5 h-0.5 rounded-full bg-white/15" />
                            <span className="text-[10px] font-mono tracking-wider text-white/25">{totalTracks} tracks</span>
                            {(artistInfo?.formed || yearsActive) && (
                                <>
                                    <span className="w-0.5 h-0.5 rounded-full bg-white/15" />
                                    <span className="text-[11px] font-mono tracking-wide text-white/35">{artistInfo?.formed?.slice(0, 4) || yearsActive}</span>
                                </>
                            )}
                            {artistInfo?.origin && (
                                <>
                                    <span className="w-0.5 h-0.5 rounded-full bg-white/15" />
                                    <span className="text-[10px] font-mono tracking-wider text-white/25">{artistInfo.origin}</span>
                                </>
                            )}
                        </div>

                        {/* Name */}
                        <h1
                            className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-light text-white leading-[0.95] tracking-tight mb-4 max-w-2xl"
                            style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
                        >
                            {artist.name}
                        </h1>

                        {/* Tags — subtle, below name */}
                        {artistInfo?.tags && artistInfo.tags.length > 0 && (
                            <p className="text-lg text-white/50 font-light mb-8">
                                {artistInfo.tags.slice(0, 3).join(' / ')}
                            </p>
                        )}

                        {/* Actions — icon-only, matching album page */}
                        <div className="flex items-center gap-6 mb-8">
                            <button
                                onClick={playAllTracks}
                                className="flex items-center justify-center text-white/50 hover:text-white transition-colors duration-300"
                            >
                                <ChromeIcon name="play" size={22} />
                            </button>
                            <button
                                onClick={shuffleAllTracks}
                                className="flex items-center justify-center text-white/50 hover:text-white transition-colors duration-300"
                            >
                                <ChromeIcon name="shuffle" size={22} />
                            </button>
                            <button
                                onClick={() => { setIsLiked(!isLiked); onToast(isLiked ? "Removed from favorites" : "Added to favorites"); }}
                                className="flex items-center justify-center text-white/50 hover:text-white transition-colors duration-300"
                            >
                                <ChromeIcon name="heart" size={22} />
                            </button>
                        </div>

                        {/* Bio */}
                        {artistInfo?.bio && artistInfo.bio.length > 100 && (
                            <div className="max-w-lg">
                                <p
                                    className={`text-sm text-white/35 leading-relaxed ${!showFullBio ? 'line-clamp-3' : ''}`}
                                    style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
                                >
                                    {artistInfo.bio}
                                </p>
                                {artistInfo.bio.length > 300 && (
                                    <button
                                        onClick={() => setShowFullBio(!showFullBio)}
                                        className="mt-2 text-[10px] font-mono text-white/25 hover:text-white/50 transition-colors uppercase tracking-wider"
                                    >
                                        {showFullBio ? 'Less' : 'More'}
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* ═══════════════ DISCOGRAPHY — Chronological grid ═══════════════ */}
            {sortedAlbums.length > 0 && (
                <div className="px-10 lg:px-14 pb-20">
                    <div className="flex items-center gap-3 mb-8">
                        <span className="text-[10px] font-mono uppercase tracking-[0.3em] text-white/20">Discography</span>
                        <span className="text-[10px] font-mono text-white/10">{sortedAlbums.length}</span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-x-5 gap-y-8">
                        {sortedAlbums.map((album) => (
                            <AlbumCard
                                key={album.id}
                                album={album}
                                artistName={artist.name}
                                isPlaying={currentlyPlayingAlbum?.id === album.id}
                                onPlay={() => playAlbum(album.id)}
                                onSelect={() => onSelectAlbum?.(album.id)}
                                isExpanded={expandedAlbum === album.id}
                                onToggle={() => toggleAlbumExpand(album.id)}
                                tracks={albumTracks[album.id] || []}
                                isLoadingTracks={loadingTracks === album.id}
                                onPlayTrack={onPlayTrack}
                                currentTrackId={audioState.currentTrack?.id}
                            />
                        ))}
                    </div>
                </div>
            )}

            {/* ═══════════════ SIMILAR ARTISTS ═══════════════ */}
            {artistInfo?.similarArtists && artistInfo.similarArtists.length > 0 && (
                <div className="px-10 lg:px-14 pb-20">
                    <div className="max-w-2xl">
                        <span className="text-[10px] font-mono uppercase tracking-[0.3em] text-white/20 mb-6 block">Similar</span>
                        <div className="flex flex-wrap gap-x-6 gap-y-2">
                            {artistInfo.similarArtists.slice(0, 8).map(similar => (
                                <span
                                    key={similar.name}
                                    className="text-white/40 hover:text-white transition-colors text-sm"
                                    style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
                                >
                                    <ArtistLink artistName={similar.name} onNavigate={(id) => onSelectArtist(id)} />
                                </span>
                            ))}
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};
