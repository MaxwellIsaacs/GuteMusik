import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { HardDrives, CircleNotch, CloudSlash } from '@phosphor-icons/react';
import { ChromeIcon } from '../components/ChromeIcon';
import { useServer } from '../context/ServerContext';
import { Album, Track } from '../types';
import { useEnrichedAlbums } from '../hooks/useAlbumYears';
import { ArtistLink } from '../components/ArtistLink';
import { PLACEHOLDER_COVER } from '../utils/placeholders';

// Get grid span classes based on album size (uniform sizing)
function getGridSpan(_size: Album['size']): string {
  return 'col-span-1 row-span-1';
}

// Arrange albums for optimal grid packing
function arrangeAlbumsForGrid(albums: Album[]): Album[] {
  // Separate by size for intentional placement
  const xl = albums.filter(a => a.size === 'xl');
  const large = albums.filter(a => a.size === 'large');
  const medium = albums.filter(a => a.size === 'medium');
  const small = albums.filter(a => a.size === 'small');

  const result: Album[] = [];
  let xlIdx = 0, largeIdx = 0, mediumIdx = 0, smallIdx = 0;

  // Distribute albums in a pattern that creates visual rhythm
  // Pattern: place 1 large/xl, then fill with 3-4 smaller items, repeat
  const totalAlbums = albums.length;

  while (result.length < totalAlbums) {
    // Add a large item every ~5 items for visual interest
    if (result.length % 5 === 0) {
      if (xlIdx < xl.length) {
        result.push(xl[xlIdx++]);
        continue;
      }
      if (largeIdx < large.length) {
        result.push(large[largeIdx++]);
        continue;
      }
    }

    // Fill with medium and small items
    if (mediumIdx < medium.length) {
      result.push(medium[mediumIdx++]);
    } else if (smallIdx < small.length) {
      result.push(small[smallIdx++]);
    } else if (largeIdx < large.length) {
      result.push(large[largeIdx++]);
    } else if (xlIdx < xl.length) {
      result.push(xl[xlIdx++]);
    } else {
      break;
    }
  }

  return result;
}

// ─── Dock-style year sidebar with macOS magnification ───
interface TemporalDockProps {
  years: string[];
  activeYear: string | null;
  filterYear: string | null;
  onYearClick: (year: string) => void;
  onYearDoubleClick: (year: string) => void;
}

const TemporalDock: React.FC<TemporalDockProps> = ({ years, activeYear, filterYear, onYearClick, onYearDoubleClick }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mouseY, setMouseY] = useState<number | null>(null);
  const rafRef = useRef<number | null>(null);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!containerRef.current) return;
    // Throttle to one update per frame — getBoundingClientRect triggers layout
    if (rafRef.current !== null) return;
    const clientY = e.clientY;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      setMouseY(clientY - rect.top);
    });
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setMouseY(null);
  }, []);

  // Dynamically size items to fit within available viewport height
  // Reserve space for top/bottom padding (roughly 120px each side for header + margins)
  const maxHeight = typeof window !== 'undefined' ? window.innerHeight - 240 : 600;
  const idealSize = 18;
  const baseSize = Math.min(idealSize, Math.max(8, years.length > 0 ? maxHeight / years.length : idealSize));
  const magnifyRadius = 60;
  const maxScale = 1.8;

  const getItemMetrics = (index: number) => {
    if (mouseY === null) return { scale: 1, proximity: 0 };
    const itemCenter = index * baseSize + baseSize / 2;
    const distance = Math.abs(mouseY - itemCenter);
    if (distance > magnifyRadius) return { scale: 1, proximity: 0 };
    const t = Math.cos((distance / magnifyRadius) * (Math.PI / 2));
    return { scale: 1 + (maxScale - 1) * t, proximity: t };
  };

  return (
    <div
      ref={containerRef}
      className="fixed right-3 top-1/2 -translate-y-1/2 z-50 flex flex-col items-end"
      style={{ maxHeight: `${maxHeight}px` }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {years.map((year, i) => {
        const { scale, proximity } = getItemMetrics(i);
        const isActive = activeYear === year;
        const isFiltered = filterYear === year;
        // Brighten labels near the cursor
        const hoverOpacity = mouseY !== null && !isFiltered ? Math.max(0.3, proximity * 0.9) : undefined;

        return (
          <button
            key={year}
            onClick={() => onYearClick(year)}
            onDoubleClick={() => onYearDoubleClick(year)}
            className="origin-right flex items-center justify-end"
            style={{
              height: `${baseSize}px`,
              transform: `scale(${scale})`,
              transition: mouseY === null ? 'transform 0.2s ease-out, opacity 0.2s ease-out' : 'none',
            }}
          >
            <span
              className={`text-[8px] font-mono leading-none px-1 rounded-sm whitespace-nowrap
                ${isFiltered ? 'bg-white text-black font-bold' : ''}
                ${isActive && !isFiltered ? 'text-white font-medium' : ''}
                ${!isActive && !isFiltered ? 'text-white/30' : ''}
              `}
              style={hoverOpacity !== undefined && !isActive ? { color: `rgba(255,255,255,${hoverOpacity})` } : undefined}
            >
              {year}
            </span>
          </button>
        );
      })}
    </div>
  );
};

interface LibraryViewProps {
  onPlayAlbum: (id: string) => void;
  onNavigateToAlbum: (id: string) => void;
  onNavigateToArtist: (id: string) => void;
  onContextMenu: (e: React.MouseEvent, item: any, type: string) => void;
  onPlayTrack?: (track: Track, queue?: Track[]) => void;
  returnToAlbumId?: string;
  onReturnHandled?: () => void;
  scrollContainer?: React.RefObject<HTMLDivElement | null>;
}

type LibraryFilter = 'all' | 'favorites';
type ViewMode = 'flat' | 'time';

export const LibraryView: React.FC<LibraryViewProps> = ({ onPlayAlbum, onNavigateToAlbum, onNavigateToArtist, onContextMenu, onPlayTrack, returnToAlbumId, onReturnHandled, scrollContainer }) => {
  const { state, albums, isLoadingAlbums, refreshAlbums, starredTracks, starredAlbums, isLoadingStarred, refreshStarred, toggleStar } = useServer();
  // Filter state (like ArtistView)
  const [libraryFilter, setLibraryFilter] = useState<LibraryFilter>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('time');
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  // Temporal scroll state
  const [activeYear, setActiveYear] = useState<string | null>(null);
  const [filterYear, setFilterYear] = useState<string | null>(null);
  const yearRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const tracksRef = useRef<HTMLDivElement | null>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setShowFilterDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Enrich albums with missing years from iTunes API
  const enrichedAlbums = useEnrichedAlbums(albums);
  const enrichedStarredAlbums = useEnrichedAlbums(starredAlbums);

  // Get the base albums based on filter (favorites or all)
  const baseAlbums = useMemo(() =>
    libraryFilter === 'favorites' ? enrichedStarredAlbums : enrichedAlbums,
    [libraryFilter, enrichedAlbums, enrichedStarredAlbums]
  );

  // Get available years from current album set
  const availableYears = useMemo(() => {
    const years = new Set<string>();
    baseAlbums.forEach(a => {
      if (a.year) years.add(a.year);
    });
    return years;
  }, [baseAlbums]);

  // Sort years newest first
  const sortedYears = useMemo(() =>
    Array.from(availableYears).sort((a: string, b: string) => parseInt(b) - parseInt(a)),
    [availableYears]
  );

  // Group albums by year
  const groupedAlbums = useMemo(() => {
    const albumsToGroup = filterYear
      ? baseAlbums.filter(a => a.year === filterYear)
      : baseAlbums;

    const groups: Record<string, Album[]> = {};

    albumsToGroup.forEach(a => {
      if (a.year) {
        if (!groups[a.year]) groups[a.year] = [];
        groups[a.year].push(a);
      }
    });

    return groups;
  }, [baseAlbums, filterYear]);

  // Get sorted years for rendering (filtered if filter active)
  const yearsToRender = useMemo(() =>
    filterYear ? [filterYear] : sortedYears,
    [filterYear, sortedYears]
  );

  // Arrange albums for optimal visual layout (flat view)
  const arrangedAlbums = useMemo(() => arrangeAlbumsForGrid(baseAlbums), [baseAlbums]);

  // IntersectionObserver for tracking active year while scrolling
  // Debounced to avoid triggering re-renders on every scroll pixel
  useEffect(() => {
    if (viewMode !== 'time') return;

    let pendingYear: string | null | undefined = undefined;
    let rafId: number | null = null;

    const handleIntersect = (entries: IntersectionObserverEntry[]) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const year = entry.target.getAttribute('data-year');
          if (year) {
            pendingYear = year;
          } else if (entry.target === tracksRef.current) {
            pendingYear = null;
          }
        }
      });
      if (pendingYear !== undefined && rafId === null) {
        rafId = requestAnimationFrame(() => {
          rafId = null;
          if (pendingYear !== undefined) {
            setActiveYear(pendingYear);
            pendingYear = undefined;
          }
        });
      }
    };

    const observer = new IntersectionObserver(handleIntersect, {
      rootMargin: '-20% 0px -70% 0px',
      threshold: 0
    });

    Object.entries(yearRefs.current).forEach(([, el]: [string, HTMLDivElement | null]) => {
      if (el) observer.observe(el);
    });

    // Also observe tracks section when favorites is active
    if (libraryFilter === 'favorites' && tracksRef.current) {
      observer.observe(tracksRef.current);
    }

    return () => {
      observer.disconnect();
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [viewMode, libraryFilter, yearsToRender]);

  // Ref to track album card DOM elements by ID
  const albumRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Scroll restoration when returning from Album view
  useEffect(() => {
    if (!returnToAlbumId) return;

    // Find the album's year from our data
    const album = baseAlbums.find(a => a.id === returnToAlbumId);

    // Use requestAnimationFrame to wait for DOM to be ready
    requestAnimationFrame(() => {
      if (viewMode === 'time' && album?.year && yearRefs.current[album.year]) {
        // Time mode — scroll to the album's year section
        yearRefs.current[album.year]?.scrollIntoView({ block: 'start' });
      } else {
        // Flat mode — scroll to the specific album card
        const albumEl = albumRefs.current[returnToAlbumId];
        if (albumEl) {
          albumEl.scrollIntoView({ block: 'center' });
        }
      }
      onReturnHandled?.();
    });
  }, [returnToAlbumId, onReturnHandled, viewMode, baseAlbums]);

  // Year click handlers
  const handleYearClick = (year: string) => {
    yearRefs.current[year]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleYearDoubleClick = (year: string) => {
    setFilterYear(prev => prev === year ? null : year);
  };

  // Show connect prompt if not connected
  if (!state.isConnected) {
    return (
      <div className="animate-fade-in pb-40 flex flex-col items-center justify-center min-h-[60vh]">
        <CloudSlash size={64} weight="light" className="text-white/20 mb-6" />
        <h2 className="text-2xl font-bold text-white/60 mb-2">Not Connected</h2>
        <p className="text-white/40 text-sm">Go to Settings to connect to your Navidrome server.</p>
      </div>
    );
  }

  // Show loading state
  if (isLoadingAlbums && albums.length === 0) {
    return (
      <div className="animate-fade-in pb-40 flex flex-col items-center justify-center min-h-[60vh]">
        <CircleNotch size={48} weight="light" className="text-white/40 animate-spin mb-4" />
        <p className="text-white/40 text-sm">Loading your collection...</p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in pb-40">
      <header className="flex items-end justify-between mb-8 sticky top-0 z-20 py-4 mix-blend-difference select-none">
        <div>
          <h1 className="text-7xl font-medium tracking-tighter text-white mb-2">Collection</h1>
          <p className="text-white/50 text-sm tracking-wide font-mono flex items-center gap-3">
             <span className="flex items-center gap-1.5"><HardDrives size={14} weight="light"/> NAVIDROME</span>
             <span className="w-1 h-1 rounded-full bg-white/30"></span>
             <span>{libraryFilter === 'favorites' ? `${starredTracks.length} TRACKS • ${starredAlbums.length} ALBUMS` : `${enrichedAlbums.length} ALBUMS`}</span>
             {libraryFilter !== 'all' && (
               <>
                 <span className="w-1 h-1 rounded-full bg-white/30"></span>
                 <span className="text-purple-400">{libraryFilter === 'favorites' ? 'Favorites' : ''}</span>
               </>
             )}
             {filterYear && (
               <>
                 <span className="w-1 h-1 rounded-full bg-white/30"></span>
                 <button onClick={() => setFilterYear(null)} className="text-purple-400 hover:text-purple-300">
                   {filterYear} ✕
                 </button>
               </>
             )}
             {(isLoadingAlbums || isLoadingStarred) && <CircleNotch size={12} weight="bold" className="animate-spin ml-2" />}
          </p>
        </div>
        <div className="flex items-center gap-2" ref={filterRef}>
          <button
            onClick={() => { setLibraryFilter('all'); setShowFilterDropdown(false); setFilterYear(null); }}
            className={`px-6 py-2 rounded-full border text-xs font-bold uppercase transition-colors ${
              libraryFilter === 'all'
                ? 'border-white/20 bg-white text-black'
                : 'border-white/10 bg-transparent text-white/50 hover:text-white hover:border-white/40'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setShowFilterDropdown(!showFilterDropdown)}
            className={`px-6 py-2 rounded-full border text-xs font-bold uppercase transition-colors ${
              libraryFilter !== 'all' || viewMode === 'time'
                ? 'border-white/20 bg-white text-black'
                : 'border-white/10 bg-transparent text-white/50 hover:text-white hover:border-white/40'
            }`}
          >
            {libraryFilter === 'all' ? 'Filter' : libraryFilter === 'favorites' ? 'Favorites' : 'Filter'}
          </button>
          {showFilterDropdown && (
            <>
              <div className="w-px h-6 bg-white/10 mx-1" />
              <button
                onClick={() => {
                  if (libraryFilter === 'favorites') {
                    setLibraryFilter('all');
                  } else {
                    setLibraryFilter('favorites');
                    refreshStarred();
                  }
                  setShowFilterDropdown(false);
                }}
                className={`px-5 py-2 rounded-full text-xs font-bold uppercase transition-colors flex items-center gap-2 ${
                  libraryFilter === 'favorites' ? 'bg-white text-black' : 'bg-white/10 text-white/70 hover:bg-white/20 hover:text-white'
                }`}
              >
                <ChromeIcon name="heart" size={12} />
                Favorites
              </button>
              <button
                onClick={() => { setViewMode(viewMode === 'time' ? 'flat' : 'time'); setShowFilterDropdown(false); }}
                className={`px-5 py-2 rounded-full text-xs font-bold uppercase transition-colors ${
                  viewMode === 'time' ? 'bg-white text-black' : 'bg-white/10 text-white/70 hover:bg-white/20 hover:text-white'
                }`}
              >
                Time
              </button>
            </>
          )}
        </div>
      </header>

      {/* Albums Section */}
      {baseAlbums.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[40vh]">
          {libraryFilter === 'favorites' ? (
            <>
              <ChromeIcon name="heart" size={64} className="opacity-20 mb-6" />
              <h2 className="text-2xl font-bold text-white/60 mb-2">No Favorite Albums</h2>
              <p className="text-white/40 text-sm">Click the heart icon on albums to add them here.</p>
            </>
          ) : (
            <>
              <p className="text-white/40 text-sm">No albums found in your library.</p>
              <button
                onClick={refreshAlbums}
                className="mt-4 px-4 py-2 text-sm text-white/60 hover:text-white border border-white/20 rounded-full transition-colors"
              >
                Refresh
              </button>
            </>
          )}
        </div>
      ) : viewMode === 'time' ? (
          <div className="relative">
            {/* Temporal Sidebar — Dock magnification */}
            <TemporalDock
              years={sortedYears}
              activeYear={activeYear}
              filterYear={filterYear}
              onYearClick={handleYearClick}
              onYearDoubleClick={handleYearDoubleClick}
            />

            {/* Albums grouped by year */}
            <div className="pr-8">
              {yearsToRender.map(year => (
                <div
                  key={year}
                  ref={el => { yearRefs.current[year] = el; }}
                  data-year={year}
                  className="mb-8"
                >
                  {/* Year heading */}
                  <div className="sticky top-28 z-10 mb-4">
                    <span className="text-4xl font-light text-white/20">{year}</span>
                  </div>

                  {/* Albums grid for this year */}
                  <div
                    className="grid gap-1.5"
                    style={{
                      gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                      gridAutoRows: '180px',
                      gridAutoFlow: 'dense',
                    }}
                  >
                    {arrangeAlbumsForGrid(groupedAlbums[year] || []).map((item: Album) => {
                      const isLarge = item.size === 'xl' || item.size === 'large';
                      return (
                        <div
                          key={item.id}
                          ref={el => { albumRefs.current[item.id] = el; }}
                          onContextMenu={(e) => onContextMenu(e, item, "Album")}
                          onClick={() => onNavigateToAlbum(item.id)}
                          className={`
                            relative group overflow-hidden cursor-pointer
                            transition-opacity duration-200 hover:z-10
                            ${getGridSpan(item.size)}
                          `}
                        >
                          <img
                            src={item.cover}
                            loading="lazy"
                            decoding="async"
                            className={`absolute inset-0 w-full h-full object-cover object-center transition-transform duration-500 group-hover:scale-105`}
                            alt={item.title}
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = PLACEHOLDER_COVER;
                            }}
                          />

                          {/* Subtle vignette */}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                          {/* Track count badge - always visible for large items */}
                          <div className={`absolute bottom-2 left-2 px-1.5 py-0.5 bg-black/60 backdrop-blur-sm rounded text-[9px] font-mono text-white/80 ${isLarge ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}>
                            {item.trackCount}
                          </div>

                          {/* Hover overlay with info */}
                          <div className="absolute inset-0 flex flex-col justify-end p-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                            <div className="transform translate-y-2 group-hover:translate-y-0 transition-transform duration-300">
                              <h3 className={`font-semibold text-white leading-tight line-clamp-2 ${isLarge ? 'text-lg' : 'text-sm'}`}>{item.title}</h3>
                              <p className="text-white/60 text-[10px] truncate mt-0.5">
                                <ArtistLink artistName={item.artist} artistId={item.artistId} onNavigate={onNavigateToArtist} />
                              </p>
                            </div>
                          </div>

                          {/* Play button */}
                          <button
                            onClick={(e) => { e.stopPropagation(); onPlayAlbum(item.id); }}
                            className={`absolute top-2 right-2 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 ${isLarge ? 'w-10 h-10' : 'w-8 h-8'}`}
                          >
                            <ChromeIcon name="play" size={isLarge ? 16 : 12} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          // Flat grid view
          <div
            className="grid gap-1.5"
            style={{
              gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
              gridAutoRows: '180px',
              gridAutoFlow: 'dense',
            }}
          >
            {arrangedAlbums.map((item: Album) => {
              const isLarge = item.size === 'xl' || item.size === 'large';
              return (
                <div
                  key={item.id}
                  ref={el => { albumRefs.current[item.id] = el; }}
                  onContextMenu={(e) => onContextMenu(e, item, "Album")}
                  onClick={() => onNavigateToAlbum(item.id)}
                  className={`
                    relative group overflow-hidden cursor-pointer
                    transition-opacity duration-200 hover:z-10
                    ${getGridSpan(item.size)}
                  `}
                >
                  <img
                    src={item.cover}
                    loading="lazy"
                    decoding="async"
                    className={`absolute inset-0 w-full h-full object-cover object-center transition-transform duration-500 group-hover:scale-105`}
                    alt={item.title}
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = PLACEHOLDER_COVER;
                    }}
                  />

                  {/* Subtle vignette */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200" />

                  {/* Track count badge - always visible for large items */}
                  <div className={`absolute bottom-2 left-2 px-1.5 py-0.5 bg-black/60 backdrop-blur-sm rounded text-[9px] font-mono text-white/80 ${isLarge ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}>
                    {item.trackCount}
                  </div>

                  {/* Hover overlay with info */}
                  <div className="absolute inset-0 flex flex-col justify-end p-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    <div>
                      <h3 className={`font-semibold text-white leading-tight line-clamp-2 ${isLarge ? 'text-lg' : 'text-sm'}`}>{item.title}</h3>
                      <p className="text-white/60 text-[10px] truncate mt-0.5">
                        <ArtistLink artistName={item.artist} artistId={item.artistId} onNavigate={onNavigateToArtist} />
                      </p>
                    </div>
                  </div>

                  {/* Play button */}
                  <button
                    onClick={(e) => { e.stopPropagation(); onPlayAlbum(item.id); }}
                    className={`absolute top-2 right-2 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 ${isLarge ? 'w-10 h-10' : 'w-8 h-8'}`}
                  >
                    <ChromeIcon name="play" size={isLarge ? 16 : 12} />
                  </button>
                </div>
              );
            })}
          </div>
        )}

      {/* Starred Tracks - shown below albums when favorites filter is active */}
      {libraryFilter === 'favorites' && starredTracks.length > 0 && (
        <div ref={tracksRef} className="mt-8">
          <h2 className="text-lg font-bold text-white/60 mb-4 uppercase tracking-widest">Favorite Tracks</h2>
          <div className="space-y-1">
            {starredTracks.map((track: Track) => (
              <div
                key={track.id}
                onClick={() => onPlayTrack?.(track, starredTracks)}
                onContextMenu={(e) => onContextMenu(e, track, "Track")}
                className="group flex items-center gap-4 p-3 rounded-lg cursor-pointer hover:bg-white/[0.06] transition-colors"
              >
                <img src={track.cover} className="w-12 h-12 rounded object-cover" alt={track.title} />
                <div className="flex-1 min-w-0">
                  <p className="text-white truncate">{track.title}</p>
                  <p className="text-xs text-white/40 truncate">
                    <ArtistLink artistName={track.artist} artistId={track.artistId} onNavigate={onNavigateToArtist} /> • {track.album}
                  </p>
                </div>
                <span className="text-xs font-mono text-white/30">{track.duration}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
