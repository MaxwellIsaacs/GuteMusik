import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { ArrowLeft, CircleNotch, CloudSlash, UsersThree, Users, MapPin } from '@phosphor-icons/react';
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

/**
 * Hook: only returns true once the element is within 200px of the viewport.
 * Prevents off-screen AlbumEntry components from firing network requests.
 */
function useIsVisible(ref: React.RefObject<HTMLElement | null>) {
    const [isVisible, setIsVisible] = useState(false);
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const observer = new IntersectionObserver(
            ([entry]) => { if (entry.isIntersecting) { setIsVisible(true); observer.disconnect(); } },
            { rootMargin: '200px' }
        );
        observer.observe(el);
        return () => observer.disconnect();
    }, [ref]);
    return isVisible;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Album Entry - Single column blog-style album display
// ═══════════════════════════════════════════════════════════════════════════════
interface AlbumEntryProps {
    album: Album;
    artistName: string;
    isPlaying: boolean;
    onPlay: () => void;
    onSelect: () => void;
    index: number;
}

const AlbumEntry: React.FC<AlbumEntryProps> = ({ album, artistName, isPlaying, onPlay, onSelect, index }) => {
    const articleRef = useRef<HTMLElement>(null);
    const isVisible = useIsVisible(articleRef);
    // Only fetch album info when the entry is near the viewport
    const { info, isLoading } = useAlbumInfo(
        isVisible ? artistName : undefined,
        isVisible ? album.title : undefined
    );

    return (
        <article
            ref={articleRef}
            className="group mb-24 last:mb-0"
        >
            {/* Year marker */}
            {album.year && (
                <div className="mb-6">
                    <span className="text-6xl font-extralight text-white/10 tabular-nums">
                        {album.year}
                    </span>
                </div>
            )}

            {/* Album content */}
            <div className="flex flex-col lg:flex-row gap-8">
                {/* Cover */}
                <div
                    className={`relative w-full lg:w-72 flex-shrink-0 cursor-pointer ${isPlaying ? 'ring-2 ring-purple-500' : ''}`}
                    onClick={onSelect}
                >
                    <div className="aspect-square overflow-hidden">
                        <img
                            src={album.cover}
                            alt={album.title}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                                (e.target as HTMLImageElement).src = `https://picsum.photos/seed/${album.id}/400/400`;
                            }}
                        />
                    </div>
                    {isPlaying && (
                        <div className="absolute bottom-3 left-3 flex items-center gap-2 px-2 py-1 bg-purple-500 text-black text-[10px] uppercase tracking-wider font-bold">
                            <div className="w-2 h-2 bg-black rounded-full animate-pulse" />
                            Playing
                        </div>
                    )}
                </div>

                {/* Info */}
                <div className="flex-1 py-2">
                    <h3
                        className="text-3xl font-light text-white mb-3 cursor-pointer hover:text-purple-400 transition-colors"
                        style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
                        onClick={onSelect}
                    >
                        {album.title}
                    </h3>

                    <p className="text-sm text-white/40 mb-6 flex items-center gap-3">
                        <span>{album.trackCount} tracks</span>
                        {album.format && (
                            <>
                                <span className="w-1 h-1 rounded-full bg-white/20" />
                                <span className="font-mono text-[10px] uppercase">{album.format}</span>
                            </>
                        )}
                        {info?.releaseType && info.releaseType !== 'Album' && (
                            <>
                                <span className="w-1 h-1 rounded-full bg-white/20" />
                                <span className="text-[10px] uppercase">{info.releaseType}</span>
                            </>
                        )}
                    </p>

                    {/* Description */}
                    {isLoading ? (
                        <div className="space-y-2 animate-pulse mb-6">
                            <div className="h-4 w-full bg-white/5" />
                            <div className="h-4 w-5/6 bg-white/5" />
                            <div className="h-4 w-4/6 bg-white/5" />
                        </div>
                    ) : info?.description ? (
                        <p
                            className="text-white/50 leading-relaxed mb-6 text-base"
                            style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
                        >
                            {info.description.length > 400
                                ? info.description.slice(0, 400) + '...'
                                : info.description}
                        </p>
                    ) : null}

                    {/* Genres */}
                    {info?.genres && info.genres.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-6">
                            {info.genres.slice(0, 4).map(genre => (
                                <span
                                    key={genre}
                                    className="px-3 py-1 text-[10px] uppercase tracking-wider text-white/40 border border-white/10"
                                >
                                    {genre}
                                </span>
                            ))}
                        </div>
                    )}

                    {/* Play button */}
                    <button
                        onClick={(e) => { e.stopPropagation(); onPlay(); }}
                        className="flex items-center gap-2 px-6 py-3 bg-white/5 text-white text-sm hover:bg-white hover:text-black transition-colors duration-200"
                    >
                        <ChromeIcon name="play" size={16} />
                        Play
                    </button>
                </div>
            </div>
        </article>
    );
};

interface ArtistViewProps {
    artistId?: string;
    onSelectArtist: (id: string | undefined) => void;
    onSelectAlbum?: (id: string) => void;
    onPlayTrack?: (track: Track, queue?: Track[]) => void;
    onToast: (m: string) => void;
}

type ArtistFilter = 'all' | 'solo' | 'collabs';

export const ArtistView: React.FC<ArtistViewProps> = ({ artistId, onSelectArtist, onSelectAlbum, onPlayTrack, onToast }) => {
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
    const [viewMode, setViewMode] = useState<'grid' | 'abc'>('grid');
    const [activeLetter, setActiveLetter] = useState<string | null>(null);
    const [filterLetter, setFilterLetter] = useState<string | null>(null);
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
    // Debounced via RAF to avoid re-renders on every scroll pixel
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
    // INDEX VIEW - Artist Grid
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

        return (
            <div className="animate-fade-in pb-40 relative">
                <header className="flex items-end justify-between mb-8 sticky top-0 z-20 py-4 mix-blend-difference select-none">
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
                                    ? 'border-white/20 bg-white text-black hover:scale-105'
                                    : 'border-white/10 bg-transparent text-white/50 hover:text-white hover:border-white/40'
                            }`}
                        >
                            {artistFilter === 'all' && viewMode === 'grid' ? 'Filter' : artistFilter === 'solo' ? 'Single' : artistFilter === 'collabs' ? 'Multi' : viewMode === 'abc' ? 'ABC' : 'Filter'}
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
                                    onClick={() => { setViewMode(viewMode === 'abc' ? 'grid' : 'abc'); setShowFilterDropdown(false); }}
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

                {/* A-Z Sidebar - only in ABC view */}
                {viewMode === 'abc' && (
                    <div className="fixed right-4 top-[25%] z-50 flex flex-col items-center">
                        {alphabet.map((letter) => {
                            const hasArtists = availableLetters.has(letter);
                            const isActive = activeLetter === letter;
                            const isFiltered = filterLetter === letter;

                            return (
                                <button
                                    key={letter}
                                    onClick={() => handleLetterClick(letter)}
                                    onDoubleClick={() => handleLetterDoubleClick(letter)}
                                    className={`w-6 h-6 text-xs font-medium flex items-center justify-center transition-colors duration-150
                                        ${isFiltered ? 'bg-white text-black rounded' : ''}
                                        ${isActive && !isFiltered ? 'text-white' : ''}
                                        ${hasArtists && !isActive && !isFiltered ? 'text-white/50 hover:text-purple-400' : ''}
                                        ${!hasArtists ? 'text-white/15' : ''}
                                    `}
                                >
                                    {letter}
                                </button>
                            );
                        })}
                    </div>
                )}

                {/* Artist Grid */}
                {filteredArtists.length === 0 ? (
                    <div className="flex flex-col items-center justify-center min-h-[40vh]">
                        <p className="text-white/40 text-sm">No artists found.</p>
                    </div>
                ) : viewMode === 'grid' ? (
                    /* Portrait card grid */
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-1.5">
                        {filteredArtists.map((artistEntry, idx) => (
                            <div
                                key={artistEntry.id}
                                onClick={() => onSelectArtist(artistEntry.id)}
                                className="group cursor-pointer relative"
                                style={{
                                    opacity: 0,
                                    animation: `fade-in 0.4s ease forwards`,
                                    animationDelay: `${idx * 20}ms`
                                }}
                            >
                                <div className="relative aspect-[3/4] overflow-hidden bg-neutral-900">
                                    <ArtistImage
                                        artistName={artistEntry.parseResult.primaryArtist}
                                        className="w-full h-full object-cover object-top grayscale-[30%] group-hover:grayscale-0 transition-[filter] duration-300"
                                        alt={artistEntry.name}
                                    />
                                    {/* Bottom gradient — editorial overlay */}
                                    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent opacity-80" />
                                    {/* Content */}
                                    <div className="absolute bottom-0 left-0 right-0 p-5">
                                        <p className="text-[9px] font-mono uppercase tracking-[0.25em] text-white/30 mb-2">
                                            {artistEntry.albumCount} {artistEntry.albumCount === 1 ? 'Album' : 'Albums'}
                                        </p>
                                        <h3
                                            className="text-white font-light text-lg leading-tight line-clamp-2"
                                            style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
                                        >
                                            {artistEntry.name}
                                        </h3>
                                    </div>
                                    {artistEntry.parseResult.isMultiArtist && (
                                        <div className="absolute top-3 right-3 px-2 py-1 bg-black/70 flex items-center gap-1.5">
                                            <UsersThree size={10} weight="bold" className="text-white/60" />
                                            <span className="text-[8px] font-mono uppercase tracking-wider text-white/40">Collab</span>
                                        </div>
                                    )}
                                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                                        <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center transform scale-75 group-hover:scale-100 transition-transform duration-300">
                                            <ChromeIcon name="play" size={20} className="ml-0.5" />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    /* ABC grouped view — portrait cards */
                    <div className="pr-8">
                        {sortedLetters.map(letter => (
                            <div
                                key={letter}
                                ref={el => { letterRefs.current[letter] = el; }}
                                data-letter={letter}
                                className="mb-8"
                            >
                                <div className="sticky top-20 z-10 mb-4">
                                    <span className="text-4xl font-light text-white/20">{letter}</span>
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-1.5">
                                    {groupedArtists[letter]?.map((artistEntry, idx) => (
                                        <div
                                            key={artistEntry.id}
                                            onClick={() => onSelectArtist(artistEntry.id)}
                                            className="group cursor-pointer relative"
                                            style={{
                                                opacity: 0,
                                                animation: `fade-in 0.4s ease forwards`,
                                                animationDelay: `${idx * 20}ms`
                                            }}
                                        >
                                            <div className="relative aspect-[3/4] overflow-hidden bg-neutral-900">
                                                <ArtistImage
                                                    artistName={artistEntry.parseResult.primaryArtist}
                                                    className="w-full h-full object-cover object-top grayscale-[30%] group-hover:grayscale-0 transition-[filter] duration-300"
                                                    alt={artistEntry.name}
                                                />
                                                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent opacity-80" />
                                                <div className="absolute bottom-0 left-0 right-0 p-5">
                                                    <p className="text-[9px] font-mono uppercase tracking-[0.25em] text-white/30 mb-2">
                                                        {artistEntry.albumCount} {artistEntry.albumCount === 1 ? 'Album' : 'Albums'}
                                                    </p>
                                                    <h3
                                                        className="text-white font-light text-lg leading-tight line-clamp-2"
                                                        style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
                                                    >
                                                        {artistEntry.name}
                                                    </h3>
                                                </div>
                                                {artistEntry.parseResult.isMultiArtist && (
                                                    <div className="absolute top-3 right-3 px-2 py-1 bg-black/70 flex items-center gap-1.5">
                                                        <UsersThree size={10} weight="bold" className="text-white/60" />
                                                        <span className="text-[8px] font-mono uppercase tracking-wider text-white/40">Collab</span>
                                                    </div>
                                                )}
                                                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                                                    <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center transform scale-75 group-hover:scale-100 transition-transform duration-300">
                                                        <ChromeIcon name="play" size={20} className="ml-0.5" />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
    }

    // ══════════════════════════════════════════════════════════════════════════════
    // DETAIL VIEW - Individual Artist
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

    return (
        <div className="artist-detail-view animate-fade-in -mx-10 -mt-6">
            {/* ════════════════════════════════════════════════════════════════
                HERO - Immersive, editorial
            ════════════════════════════════════════════════════════════════ */}
            <div className="relative min-h-[80vh] flex">
                {/* Image side - takes 50% */}
                <div className="w-1/2 relative overflow-hidden hidden lg:block">
                    <ArtistImage
                        artistName={artist.name}
                        className={`absolute inset-0 w-full h-full object-cover object-top transition-opacity duration-500 ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
                        alt={artist.name}
                    />
                    <button
                        onClick={() => onSelectArtist(undefined)}
                        className={`absolute top-8 left-8 flex items-center gap-2 text-white/60 hover:text-white transition-colors ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
                    >
                        <ArrowLeft size={20} weight="bold" />
                        <span className="text-xs uppercase tracking-widest font-medium">Back</span>
                    </button>
                </div>

                {/* Content side */}
                <div className="flex-1 flex flex-col justify-end p-10 lg:p-16 relative bg-[#0a0a0a]">
                    <button
                        onClick={() => onSelectArtist(undefined)}
                        className="lg:hidden absolute top-6 left-6 flex items-center gap-2 text-white/60 hover:text-white"
                    >
                        <ArrowLeft size={18} weight="bold" />
                    </button>

                    <div className="lg:hidden absolute inset-0 -z-10">
                        <ArtistImage artistName={artist.name} className="w-full h-full object-cover object-top opacity-20" alt={artist.name} />
                    </div>

                    {/* Tags */}
                    {artistInfo?.tags && artistInfo.tags.length > 0 && (
                        <div className={`flex flex-wrap gap-2 mb-6 transition-opacity duration-300 ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}>
                            {artistInfo.tags.slice(0, 4).map(tag => (
                                <span key={tag} className="px-3 py-1 text-[10px] uppercase tracking-wider text-white/50 border border-white/10">
                                    {tag}
                                </span>
                            ))}
                        </div>
                    )}

                    {/* Name */}
                    <h1
                        className={`text-5xl sm:text-6xl lg:text-7xl xl:text-8xl font-light text-white leading-[0.9] tracking-tight mb-6 transition-opacity duration-300 ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
                        style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
                    >
                        {artist.name}
                    </h1>

                    {/* Stats row */}
                    <div className={`flex flex-wrap items-center gap-6 mb-8 transition-opacity duration-300 ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}>
                        <div className="flex items-center gap-2">
                            <ChromeIcon name="album" size={16} className="opacity-30" />
                            <span className="text-sm text-white/60">{artistAlbums.length} albums</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <ChromeIcon name="music-note" size={16} className="opacity-30" />
                            <span className="text-sm text-white/60">{totalTracks} tracks</span>
                        </div>
                        {(artistInfo?.formed || yearsActive) && (
                            <div className="flex items-center gap-2">
                                <span className="text-sm text-white/60">{artistInfo?.formed?.slice(0, 4) || yearsActive}</span>
                            </div>
                        )}
                        {artistInfo?.origin && (
                            <div className="flex items-center gap-2">
                                <MapPin size={16} weight="bold" className="text-white/30" />
                                <span className="text-sm text-white/60">{artistInfo.origin}</span>
                            </div>
                        )}
                    </div>

                    {/* Bio summary */}
                    {artistInfo?.bioSummary && (
                        <p className={`text-white/50 text-base leading-relaxed max-w-xl mb-8 transition-opacity duration-300 ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}>
                            {artistInfo.bioSummary.slice(0, 200)}
                            {artistInfo.bioSummary.length > 200 && '...'}
                        </p>
                    )}

                    {/* Action buttons */}
                    <div className={`flex items-center gap-3 transition-opacity duration-300 ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}>
                        <button onClick={playAllTracks} className="flex items-center gap-3 px-8 py-4 bg-white/5 text-white border border-white/10 font-medium text-sm uppercase tracking-wider hover:bg-white/10 transition-colors duration-300">
                            <ChromeIcon name="play" size={18} />
                            Play All
                        </button>
                        <button onClick={shuffleAllTracks} className="flex items-center gap-3 px-6 py-4 bg-white/5 text-white border border-white/10 hover:bg-white/10 hover:border-white/20 transition-colors duration-200">
                            <ChromeIcon name="shuffle" size={18} />
                        </button>
                        <button
                            onClick={() => { setIsLiked(!isLiked); onToast(isLiked ? "Removed from favorites" : "Added to favorites"); }}
                            className={`flex items-center gap-3 px-6 py-4 border transition-colors duration-200 ${isLiked ? 'bg-rose-500/20 border-rose-500/30' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
                        >
                            <ChromeIcon name="heart" size={18} className={isLiked ? 'opacity-100' : 'opacity-60'} />
                        </button>
                    </div>
                </div>
            </div>

            {/* ════════════════════════════════════════════════════════════════
                ABOUT - Blog-like reading experience
            ════════════════════════════════════════════════════════════════ */}
            {artistInfo?.bio && artistInfo.bio.length > 100 && (
                <div className="px-10 lg:px-16 py-20 bg-[#080808] border-t border-white/5">
                    <div className="max-w-3xl">
                        <div className="flex items-center gap-4 mb-8">
                            <h2 className="text-sm uppercase tracking-[0.3em] text-white/30">About</h2>
                            <SourceBadge source={artistInfoSource} />
                        </div>
                        <div className="prose prose-invert prose-lg">
                            <p className={`text-white/70 text-lg leading-[1.8] ${!showFullBio ? 'line-clamp-6' : ''}`} style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
                                {artistInfo.bio}
                            </p>
                        </div>
                        {artistInfo.bio.length > 500 && (
                            <button
                                onClick={() => setShowFullBio(!showFullBio)}
                                className="mt-6 text-sm text-purple-500 hover:text-purple-400 transition-colors"
                            >
                                {showFullBio ? 'Show less' : 'Read more'}
                            </button>
                        )}
                    </div>

                    {/* Similar Artists */}
                    {artistInfo.similarArtists && artistInfo.similarArtists.length > 0 && (
                        <div className="mt-16 pt-16 border-t border-white/5">
                            <h3 className="text-sm uppercase tracking-[0.3em] text-white/30 mb-6 flex items-center gap-2">
                                <Users size={14} weight="bold" />
                                Similar Artists
                            </h3>
                            <div className="flex flex-wrap gap-3">
                                {artistInfo.similarArtists.slice(0, 8).map(similar => (
                                    <span key={similar.name} className="px-4 py-2 text-sm text-white/60 bg-white/5 hover:bg-white/10 hover:text-white transition-colors">
                                        <ArtistLink artistName={similar.name} onNavigate={(id) => onSelectArtist(id)} />
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ════════════════════════════════════════════════════════════════
                DISCOGRAPHY - Blog-style single column
            ════════════════════════════════════════════════════════════════ */}
            <div className="px-10 lg:px-16 py-20 bg-[#0a0a0a]">
                {artistAlbums.length > 0 && (
                    <div className="max-w-4xl">
                        {artistAlbums
                            .slice()
                            .sort((a, b) => parseInt(b.year || '0') - parseInt(a.year || '0'))
                            .map((album, idx) => (
                                <AlbumEntry
                                    key={album.id}
                                    album={album}
                                    artistName={artist.name}
                                    isPlaying={currentlyPlayingAlbum?.id === album.id}
                                    onPlay={() => playAlbum(album.id)}
                                    onSelect={() => onSelectAlbum?.(album.id)}
                                    index={idx}
                                />
                            ))}
                    </div>
                )}
            </div>

            {/* Bottom spacing */}
            <div className="h-40 bg-[#0a0a0a]" />
        </div>
    );
};
