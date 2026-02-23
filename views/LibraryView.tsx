import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { HardDrives, CircleNotch, CloudSlash } from '@phosphor-icons/react';
import { ChromeIcon } from '../components/ChromeIcon';
import { useServer } from '../context/ServerContext';
import { Album, Track } from '../types';
import { useEnrichedAlbums } from '../hooks/useAlbumYears';
import { ArtistLink } from '../components/ArtistLink';
import { PLACEHOLDER_COVER } from '../utils/placeholders';

// ─── Grid layout constants ───
const ITEM_H = 180;
const GRID_GAP = 6;
const ROW_H = ITEM_H + GRID_GAP;
const YEAR_HEADING_H = 64; // text-4xl + mb-4
const YEAR_GROUP_MB = 32;  // mb-8
const VIRTUAL_BUFFER_ROWS = 6;
const VIRTUAL_BUFFER_PX_FACTOR = 2.5; // viewport-heights of buffer for time view

// Get grid span classes based on album size (uniform sizing)
function getGridSpan(_size: Album['size']): string {
  return 'col-span-1 row-span-1';
}

// Arrange albums for optimal grid packing
function arrangeAlbumsForGrid(albums: Album[]): Album[] {
  const xl = albums.filter(a => a.size === 'xl');
  const large = albums.filter(a => a.size === 'large');
  const medium = albums.filter(a => a.size === 'medium');
  const small = albums.filter(a => a.size === 'small');

  const result: Album[] = [];
  let xlIdx = 0, largeIdx = 0, mediumIdx = 0, smallIdx = 0;
  const totalAlbums = albums.length;

  while (result.length < totalAlbums) {
    if (result.length % 5 === 0) {
      if (xlIdx < xl.length) { result.push(xl[xlIdx++]); continue; }
      if (largeIdx < large.length) { result.push(large[largeIdx++]); continue; }
    }
    if (mediumIdx < medium.length) result.push(medium[mediumIdx++]);
    else if (smallIdx < small.length) result.push(small[smallIdx++]);
    else if (largeIdx < large.length) result.push(large[largeIdx++]);
    else if (xlIdx < xl.length) result.push(xl[xlIdx++]);
    else break;
  }
  return result;
}

// Compute column count from available width
function computeGridCols(width: number): number {
  return Math.max(1, Math.floor((width + GRID_GAP) / (ITEM_H + GRID_GAP)));
}

// ─── Album card (extracted to avoid duplication) ───
interface AlbumCardProps {
  item: Album;
  onPlay: (id: string) => void;
  onNavigate: (id: string) => void;
  onNavigateToArtist: (id: string) => void;
  onContextMenu: (e: React.MouseEvent, item: any, type: string) => void;
  cardRef?: (el: HTMLDivElement | null) => void;
}

const AlbumCard: React.FC<AlbumCardProps> = React.memo(({ item, onPlay, onNavigate, onNavigateToArtist, onContextMenu, cardRef }) => {
  const isLarge = item.size === 'xl' || item.size === 'large';
  return (
    <div
      ref={cardRef}
      onContextMenu={(e) => onContextMenu(e, item, "Album")}
      onClick={() => onNavigate(item.id)}
      className={`relative group overflow-hidden cursor-pointer hover:z-10 ${getGridSpan(item.size)}`}
      style={{ contain: 'layout paint' }}
    >
      <img
        src={item.cover}
        className="absolute inset-0 w-full h-full object-cover object-center transition-transform duration-500 group-hover:scale-105"
        alt={item.title}
        onError={(e) => { (e.target as HTMLImageElement).src = PLACEHOLDER_COVER; }}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
      <div className={`absolute bottom-2 left-2 px-1.5 py-0.5 bg-black/60 rounded text-[9px] font-mono text-white/80 ${isLarge ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}>
        {item.trackCount}
      </div>
      <div className="absolute inset-0 flex flex-col justify-end p-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <div className="transform translate-y-2 group-hover:translate-y-0 transition-transform duration-200">
          <h3 className={`font-semibold text-white leading-tight line-clamp-2 ${isLarge ? 'text-lg' : 'text-sm'}`}>{item.title}</h3>
          <p className="text-white/60 text-[10px] truncate mt-0.5">
            <ArtistLink artistName={item.artist} artistId={item.artistId} onNavigate={onNavigateToArtist} />
          </p>
        </div>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onPlay(item.id); }}
        className={`absolute top-2 right-2 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 ${isLarge ? 'w-10 h-10' : 'w-8 h-8'}`}
      >
        <ChromeIcon name="play" size={isLarge ? 16 : 12} />
      </button>
    </div>
  );
});

// ─── Year sidebar — pure CSS dock bulge via :has() ───
interface TemporalDockProps {
  years: string[];
  activeYear: string | null;
  filterYear: string | null;
  onYearClick: (year: string) => void;
  onYearDoubleClick: (year: string) => void;
}

const TemporalDock: React.FC<TemporalDockProps> = ({ years, activeYear, filterYear, onYearClick, onYearDoubleClick }) => {
  const availH = typeof window !== 'undefined' ? window.innerHeight - 160 : 600;
  // Scale font so all years fit: 12px ideal, shrinks to 7px for huge lists
  const fontSize = Math.min(12, Math.max(7, availH / years.length - 1));

  return (
    <div className="year-dock flex flex-col items-end">
      {years.map((year) => {
        const isActive = activeYear === year;
        const isFiltered = filterYear === year;

        return (
          <button
            key={year}
            onClick={() => onYearClick(year)}
            onDoubleClick={() => onYearDoubleClick(year)}
            className={`
              font-mono leading-none text-right
              ${isFiltered ? 'text-white font-bold' : isActive ? 'text-white/80' : 'text-white/20'}
            `}
            style={{ fontSize: `${fontSize}px`, paddingBlock: `${Math.max(0, (fontSize - 8) * 0.3)}px` }}
          >
            {year}
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

  // Filter state
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

  const baseAlbums = useMemo(() =>
    libraryFilter === 'favorites' ? enrichedStarredAlbums : enrichedAlbums,
    [libraryFilter, enrichedAlbums, enrichedStarredAlbums]
  );

  const availableYears = useMemo(() => {
    const years = new Set<string>();
    baseAlbums.forEach(a => { if (a.year) years.add(a.year); });
    return years;
  }, [baseAlbums]);

  const sortedYears = useMemo(() =>
    Array.from(availableYears).sort((a: string, b: string) => parseInt(b) - parseInt(a)),
    [availableYears]
  );

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

  const yearsToRender = useMemo(() =>
    filterYear ? [filterYear] : sortedYears,
    [filterYear, sortedYears]
  );

  const arrangedAlbums = useMemo(() => arrangeAlbumsForGrid(baseAlbums), [baseAlbums]);

  const arrangedByYear = useMemo(() => {
    const result: Record<string, Album[]> = {};
    for (const year of yearsToRender) {
      result[year] = arrangeAlbumsForGrid(groupedAlbums[year] || []);
    }
    return result;
  }, [yearsToRender, groupedAlbums]);

  // ─── Virtual scroll infrastructure ───
  const outerRef = useRef<HTMLDivElement>(null);
  const flatGridRef = useRef<HTMLDivElement>(null);
  const albumRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [gridCols, setGridCols] = useState(6);

  // Flat view: which item indices are rendered
  const [flatStart, setFlatStart] = useState(0);
  const [flatEnd, setFlatEnd] = useState(100);

  // Time view: which year groups are rendered (generous buffer so you never see blanks)
  const [visibleYears, setVisibleYears] = useState<Set<string>>(() => new Set(yearsToRender));

  // Compute year group layout (cumulative positions + heights)
  const yearLayout = useMemo(() => {
    let y = 0;
    return yearsToRender.map(year => {
      const albs = arrangedByYear[year] || [];
      const rows = Math.ceil(albs.length / gridCols);
      const gridH = rows > 0 ? rows * ROW_H - GRID_GAP : 0;
      const contentH = YEAR_HEADING_H + gridH;
      const totalH = contentH + YEAR_GROUP_MB;
      const top = y;
      y += totalH;
      return { year, albums: albs, top, contentH, totalH };
    });
  }, [yearsToRender, arrangedByYear, gridCols]);

  // Flat view totals
  const flatTotalRows = Math.ceil(arrangedAlbums.length / gridCols);
  const flatTotalHeight = flatTotalRows > 0 ? flatTotalRows * ROW_H - GRID_GAP : 0;
  const flatStartRow = Math.floor(flatStart / gridCols);
  const flatTopOffset = flatStartRow * ROW_H;
  const flatVisibleItems = arrangedAlbums.slice(flatStart, flatEnd);

  // ─── Preload all album covers into browser cache ───
  useEffect(() => {
    const urls = baseAlbums.map(a => a.cover).filter(Boolean);
    if (urls.length === 0) return;
    let cancelled = false;
    let idx = 0;
    const BATCH = 30;
    const DELAY = 30;

    function loadBatch() {
      if (cancelled || idx >= urls.length) return;
      const end = Math.min(idx + BATCH, urls.length);
      for (; idx < end; idx++) {
        const img = new Image();
        img.src = urls[idx];
      }
      setTimeout(loadBatch, DELAY);
    }

    const id = setTimeout(loadBatch, 100);
    return () => { cancelled = true; clearTimeout(id); };
  }, [baseAlbums]);

  // ─── Scroll + resize handler: measure cols, compute visible ranges ───
  useEffect(() => {
    const scrollEl = scrollContainer?.current;
    const outerEl = outerRef.current;
    if (!outerEl) return;

    let raf: number | null = null;

    const update = () => {
      raf = null;
      // Measure column count from container width
      const outerW = outerEl.clientWidth;
      const dockWidth = viewMode === 'time' ? 0 : 0; // dock overlaps into padding via -mr-10
      const cols = computeGridCols(outerW - dockWidth);
      setGridCols(cols);

      if (!scrollEl) return;
      const viewH = scrollEl.clientHeight;

      if (viewMode === 'flat') {
        const gridEl = flatGridRef.current;
        if (!gridEl) return;
        const gridRect = gridEl.getBoundingClientRect();
        const scrollRect = scrollEl.getBoundingClientRect();
        const gridTop = gridRect.top - scrollRect.top;
        const totalRows = Math.ceil(arrangedAlbums.length / cols);

        const firstRow = Math.max(0, Math.floor(-gridTop / ROW_H) - VIRTUAL_BUFFER_ROWS);
        const lastRow = Math.min(totalRows - 1, Math.ceil((-gridTop + viewH) / ROW_H) + VIRTUAL_BUFFER_ROWS);
        setFlatStart(firstRow * cols);
        setFlatEnd(Math.min(arrangedAlbums.length, (lastRow + 1) * cols));
      } else {
        // Time view: determine visible year groups with generous pixel buffer
        const outerRect = outerEl.getBoundingClientRect();
        const scrollRect = scrollEl.getBoundingClientRect();
        const baseTop = outerRect.top - scrollRect.top;
        // Account for header height (~120px from sticky header + padding)
        // yearLayout positions are relative to the year container which starts after the header
        // We approximate by using the outerRef position which includes the header
        const bufferPx = viewH * VIRTUAL_BUFFER_PX_FACTOR;
        const visible = new Set<string>();
        for (const g of yearLayout) {
          // Approximate position: baseTop + header offset + g.top
          // Since yearLayout.top is relative to the year groups container,
          // and we measure from outerRef (which includes header ~120px), add an offset.
          // However, exact offset doesn't matter much — the generous buffer compensates.
          const gTop = baseTop + g.top + 120; // rough header offset
          const gBottom = gTop + g.totalH;
          if (gBottom > -bufferPx && gTop < viewH + bufferPx) {
            visible.add(g.year);
          }
        }
        setVisibleYears(visible);
      }
    };

    const onScroll = () => {
      if (raf === null) raf = requestAnimationFrame(update);
    };

    // Initial computation
    update();

    const ro = new ResizeObserver(() => update());
    ro.observe(outerEl);
    if (scrollEl) scrollEl.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      if (raf !== null) cancelAnimationFrame(raf);
      ro.disconnect();
      if (scrollEl) scrollEl.removeEventListener('scroll', onScroll);
    };
  }, [viewMode, scrollContainer, arrangedAlbums.length, yearLayout]);

  // ─── IntersectionObserver for tracking active year ───
  useEffect(() => {
    if (viewMode !== 'time') return;

    let pendingYear: string | null | undefined = undefined;
    let rafId: number | null = null;

    const handleIntersect = (entries: IntersectionObserverEntry[]) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const year = entry.target.getAttribute('data-year');
          if (year) pendingYear = year;
          else if (entry.target === tracksRef.current) pendingYear = null;
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
      threshold: 0,
    });

    Object.entries(yearRefs.current).forEach(([, el]) => {
      if (el) observer.observe(el);
    });

    if (libraryFilter === 'favorites' && tracksRef.current) {
      observer.observe(tracksRef.current);
    }

    return () => {
      observer.disconnect();
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [viewMode, libraryFilter, yearsToRender]);

  const handleYearClick = (year: string) => {
    yearRefs.current[year]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
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

  if (isLoadingAlbums && albums.length === 0) {
    return (
      <div className="animate-fade-in pb-40 flex flex-col items-center justify-center min-h-[60vh]">
        <CircleNotch size={48} weight="light" className="text-white/40 animate-spin mb-4" />
        <p className="text-white/40 text-sm">Loading your collection...</p>
      </div>
    );
  }

  return (
    <div ref={outerRef} className="animate-fade-in pb-40">
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
          <div className="flex">
            {/* Albums grouped by year — placeholder-virtualized */}
            <div className="flex-1 min-w-0">
              {yearLayout.map(({ year, albums: yearAlbums, contentH }) => {
                const isVisible = visibleYears.has(year);
                return isVisible ? (
                  <div
                    key={year}
                    ref={el => { yearRefs.current[year] = el; }}
                    data-year={year}
                    className="mb-8"
                  >
                    <div className="sticky top-28 z-10 mb-4">
                      <span className="text-4xl font-light text-white/20">{year}</span>
                    </div>
                    <div
                      className="grid gap-1.5"
                      style={{
                        gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                        gridAutoRows: '180px',
                        gridAutoFlow: 'dense',
                      }}
                    >
                      {yearAlbums.map((item: Album) => (
                        <AlbumCard
                          key={item.id}
                          item={item}
                          onPlay={onPlayAlbum}
                          onNavigate={onNavigateToAlbum}
                          onNavigateToArtist={onNavigateToArtist}
                          onContextMenu={onContextMenu}
                          cardRef={el => { albumRefs.current[item.id] = el; }}
                        />
                      ))}
                    </div>
                  </div>
                ) : (
                  <div
                    key={year}
                    ref={el => { yearRefs.current[year] = el; }}
                    data-year={year}
                    style={{ height: contentH, marginBottom: YEAR_GROUP_MB }}
                  />
                );
              })}
            </div>

            {/* Dock rail — sticky sidebar flush right */}
            <div className="w-10 shrink-0 -mr-10">
              <div className="sticky top-[calc(50vh-7rem)] -translate-y-1/2 flex justify-end z-30">
                <TemporalDock
                  years={sortedYears}
                  activeYear={activeYear}
                  filterYear={filterYear}
                  onYearClick={handleYearClick}
                  onYearDoubleClick={handleYearDoubleClick}
                />
              </div>
            </div>
          </div>
        ) : (
          // Flat grid view — virtual: only visible rows are in the DOM
          <div
            ref={flatGridRef}
            style={{ position: 'relative', height: flatTotalHeight }}
          >
            <div
              style={{
                position: 'absolute',
                top: flatTopOffset,
                left: 0,
                right: 0,
                display: 'grid',
                gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
                gridAutoRows: `${ITEM_H}px`,
                gap: `${GRID_GAP}px`,
              }}
            >
              {flatVisibleItems.map((item: Album) => (
                <AlbumCard
                  key={item.id}
                  item={item}
                  onPlay={onPlayAlbum}
                  onNavigate={onNavigateToAlbum}
                  onNavigateToArtist={onNavigateToArtist}
                  onContextMenu={onContextMenu}
                  cardRef={el => { albumRefs.current[item.id] = el; }}
                />
              ))}
            </div>
          </div>
        )}

      {/* Starred Tracks */}
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
