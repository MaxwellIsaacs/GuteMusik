import React, { useState, useCallback, useRef, useEffect } from 'react';
import { usePluginAPI } from '../../context/PluginContext';
import { DownloadQueue } from './DownloadQueue';

interface MbArtist {
  id: string;
  name: string;
  disambiguation: string;
}

interface MbAlbum {
  id: string;
  title: string;
  year: string;
  type: string;
  secondary_types: string[];
}

type ReleaseCategory =
  | 'studio_album'
  | 'ep'
  | 'live'
  | 'compilation'
  | 'mixtape'
  | 'single'
  | 'soundtrack'
  | 'demo'
  | 'remix'
  | 'other';

interface ClassifiedAlbum {
  id: string;
  title: string;
  year: string;
  type: string;
  secondary_types: string[];
  category: ReleaseCategory;
  confidence: number;
  sources: string[];
}

const CATEGORY_LABELS: Record<ReleaseCategory, string> = {
  studio_album: 'Studio Albums',
  ep: 'EPs',
  live: 'Live Albums',
  compilation: 'Compilations',
  mixtape: 'Mixtapes',
  single: 'Singles',
  soundtrack: 'Soundtracks',
  demo: 'Demos',
  remix: 'Remixes',
  other: 'Other',
};

const CATEGORY_ORDER: ReleaseCategory[] = [
  'studio_album',
  'ep',
  'mixtape',
  'live',
  'compilation',
  'soundtrack',
  'remix',
  'demo',
  'single',
  'other',
];

interface ManualAlbum {
  artist: string;
  album: string;
  year: string;
  genre: string;
}

interface YtSearchResult {
  id: string;
  title: string;
  duration: string;
  channel: string;
}

interface SongEntry {
  ytResult: YtSearchResult;
  artist: string;
  album: string;
  title: string;
  year: string;
  genre: string;
}

type Tab = 'search' | 'songs' | 'manual';
type CategoryFilter = ReleaseCategory | 'all';

// ── Lazy loading image component ──────────────────────────────────────────
const LazyImage: React.FC<{ src: string; alt: string; className: string }> = ({ src, alt, className }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [hasError, setHasError] = useState(false);
  const imgRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '100px' }
    );

    if (imgRef.current) {
      observer.observe(imgRef.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <div ref={imgRef} className={className}>
      {isVisible && !hasError && (
        <img
          src={src}
          alt={alt}
          className="w-full h-full object-cover"
          onError={() => setHasError(true)}
          loading="lazy"
        />
      )}
    </div>
  );
};

// ── Inline spinner ────────────────────────────────────────────────────────
const InlineSpinner: React.FC = () => (
  <span className="w-4 h-4 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
);

export const DownloaderView: React.FC = () => {
  const api = usePluginAPI();
  const { invoke } = api.ipc;
  const onToast = api.ui.toast;
  const serverState = api.library.serverState;
  const refreshAlbums = api.library.refreshAlbums;
  const refreshArtists = api.library.refreshArtists;

  const [activeTab, setActiveTab] = useState<Tab>('search');

  // ── Search flow state ──────────────────────────────────────────────────
  const [searchInput, setSearchInput] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [artistResults, setArtistResults] = useState<MbArtist[]>([]);
  const [selectedArtist, setSelectedArtist] = useState<MbArtist | null>(null);
  const [autoSelectedName, setAutoSelectedName] = useState<string | null>(null);
  const [isLoadingDiscography, setIsLoadingDiscography] = useState(false);
  const [discography, setDiscography] = useState<ClassifiedAlbum[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [genreOverride, setGenreOverride] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [lastClickedIndex, setLastClickedIndex] = useState<number | null>(null);
  const [discographySearch, setDiscographySearch] = useState('');
  const [collapsedCategories, setCollapsedCategories] = useState<Set<ReleaseCategory>>(new Set());
  const [preferClean, setPreferClean] = useState(false);

  // ── Manual mode state ──────────────────────────────────────────────────
  const [manualEntries, setManualEntries] = useState<ManualAlbum[]>([
    { artist: '', album: '', year: '', genre: '' },
  ]);

  // ── Song search state ─────────────────────────────────────────────────
  const [songSearchInput, setSongSearchInput] = useState('');
  const [isSearchingSongs, setIsSearchingSongs] = useState(false);
  const [songResults, setSongResults] = useState<YtSearchResult[]>([]);
  const [songEntries, setSongEntries] = useState<SongEntry[]>([]);
  const [songGenre, setSongGenre] = useState('');
  const [expandedSongId, setExpandedSongId] = useState<string | null>(null);

  // ── Settings state ──
  const [musicDir, setMusicDir] = useState('');
  const [musicDirInput, setMusicDirInput] = useState('');
  const [isSavingDir, setIsSavingDir] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Load music dir on mount
  useEffect(() => {
    invoke<string>('downloader_get_music_dir').then(dir => {
      setMusicDir(dir);
      setMusicDirInput(dir);
    }).catch(() => {});
  }, []);

  const handleSaveMusicDir = useCallback(async () => {
    const trimmed = musicDirInput.trim();
    if (!trimmed || trimmed === musicDir) return;
    setIsSavingDir(true);
    try {
      await invoke('downloader_set_music_dir', { path: trimmed });
      setMusicDir(trimmed);
      onToast('Download directory updated');
    } catch (e: any) {
      onToast(`Failed to set directory: ${e}`);
      setMusicDirInput(musicDir);
    } finally {
      setIsSavingDir(false);
    }
  }, [musicDirInput, musicDir, onToast]);

  // ── Download state ──
  const [justSubmitted, setJustSubmitted] = useState(false);

  // ── Debounce refs ──
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout>>();
  const songDebounceRef = useRef<ReturnType<typeof setTimeout>>();

  // ── Search for artists ─────────────────────────────────────────────────
  const handleSearch = useCallback(async (query?: string) => {
    const q = (query ?? searchInput).trim();
    if (!q) return;

    setIsSearching(true);
    setArtistResults([]);
    setSelectedArtist(null);
    setAutoSelectedName(null);
    setDiscography([]);
    setSelected(new Set());

    try {
      const results = await invoke<MbArtist[]>('downloader_search_artist', { artist: q });
      setArtistResults(results);
      if (results.length === 1) {
        setAutoSelectedName(results[0].name);
        handleSelectArtist(results[0]);
      } else if (results.length > 0 && results[0].name.toLowerCase() === q.toLowerCase()) {
        setAutoSelectedName(results[0].name);
        handleSelectArtist(results[0]);
      }
    } catch (e: any) {
      onToast(`Search failed: ${e}`);
    } finally {
      setIsSearching(false);
    }
  }, [searchInput, onToast]);

  // ── Debounced artist search ────────────────────────────────────────────
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);

    const q = searchInput.trim();
    if (!q) {
      setArtistResults([]);
      setSelectedArtist(null);
      setAutoSelectedName(null);
      setDiscography([]);
      setSelected(new Set());
      return;
    }

    searchDebounceRef.current = setTimeout(() => {
      handleSearch(q);
    }, 400);

    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [searchInput]);

  // ── Select artist -> load discography ──────────────────────────────────
  const handleSelectArtist = useCallback(async (artist: MbArtist) => {
    setSelectedArtist(artist);
    setIsLoadingDiscography(true);
    setDiscography([]);
    setSelected(new Set());
    setCollapsedCategories(new Set());

    try {
      const albums = await invoke<ClassifiedAlbum[]>('downloader_get_full_discography', {
        artistId: artist.id,
        artistName: artist.name,
      });
      setDiscography(albums);
    } catch (e: any) {
      onToast(`Failed to load discography: ${e}`);
    } finally {
      setIsLoadingDiscography(false);
    }
  }, [onToast]);

  // ── Filter discography ─────────────────────────────────────────────────
  const filteredDiscography = discography.filter(a => {
    if (categoryFilter !== 'all' && a.category !== categoryFilter) return false;

    if (discographySearch.trim()) {
      const q = discographySearch.trim().toLowerCase();
      if (!a.title.toLowerCase().includes(q)) return false;
    }

    return true;
  });

  // ── Toggle album selection (with shift+click range) ────────────────────
  const toggleSelect = (id: string, index: number, shiftKey: boolean) => {
    if (shiftKey && lastClickedIndex !== null) {
      const start = Math.min(lastClickedIndex, index);
      const end = Math.max(lastClickedIndex, index);
      setSelected(prev => {
        const next = new Set(prev);
        for (let i = start; i <= end; i++) {
          next.add(filteredDiscography[i].id);
        }
        return next;
      });
    } else {
      setSelected(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    }
    setLastClickedIndex(index);
  };

  const selectAll = () => {
    const filteredIds = filteredDiscography.map(a => a.id);
    if (filteredIds.every(id => selected.has(id))) {
      setSelected(prev => {
        const next = new Set(prev);
        filteredIds.forEach(id => next.delete(id));
        return next;
      });
    } else {
      setSelected(prev => {
        const next = new Set(prev);
        filteredIds.forEach(id => next.add(id));
        return next;
      });
    }
  };

  // ── Download all studio albums in one click ─────────────────────────
  const handleDownloadAllStudios = useCallback(async () => {
    if (!selectedArtist) return;
    const studios = discography.filter(a => a.category === 'studio_album');
    if (studios.length === 0) {
      onToast('No studio albums found');
      return;
    }

    const albums = studios.map(a => ({
      artist: selectedArtist.name,
      album: a.title,
      year: a.year,
      genre: genreOverride || 'Rock',
      tracks: null as string[] | null,
      prefer_clean: preferClean,
    }));

    try {
      await invoke('downloader_start', { albums });
      onToast(`Queued ${albums.length} studio album${albums.length > 1 ? 's' : ''} for download`);
      setSelected(new Set());
      setJustSubmitted(true);
      setTimeout(() => setJustSubmitted(false), 2000);
    } catch (e: any) {
      onToast(`Download failed: ${e}`);
    }
  }, [discography, selectedArtist, genreOverride, preferClean, onToast]);

  // ── Toggle category collapse ────────────────────────────────────────
  const toggleCategoryCollapse = (cat: ReleaseCategory) => {
    setCollapsedCategories(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  // ── Start download (search mode) ──────────────────────────────────────
  const handleDownloadSelected = useCallback(async () => {
    if (!selectedArtist) return;
    const toDownload = discography.filter(a => selected.has(a.id));
    if (toDownload.length === 0) {
      onToast('No albums selected');
      return;
    }

    const albums = toDownload.map(a => ({
      artist: selectedArtist.name,
      album: a.title,
      year: a.year,
      genre: genreOverride || 'Rock',
      tracks: null as string[] | null,
      prefer_clean: preferClean,
    }));

    try {
      await invoke('downloader_start', { albums });
      onToast(`Queued ${albums.length} album${albums.length > 1 ? 's' : ''} for download`);
      setSelected(new Set());
      setJustSubmitted(true);
      setTimeout(() => setJustSubmitted(false), 2000);
    } catch (e: any) {
      onToast(`Download failed: ${e}`);
    }
  }, [discography, selected, selectedArtist, genreOverride, preferClean, onToast]);

  // ── Search for songs on YouTube ────────────────────────────────────────
  const handleSearchSongs = useCallback(async (query?: string) => {
    const q = (query ?? songSearchInput).trim();
    if (!q) return;

    setIsSearchingSongs(true);
    setSongResults([]);

    try {
      const results = await invoke<YtSearchResult[]>('downloader_search_songs', { query: q });
      setSongResults(results);
    } catch (e: any) {
      onToast(`Song search failed: ${e}`);
    } finally {
      setIsSearchingSongs(false);
    }
  }, [songSearchInput, onToast]);

  // ── Debounced song search ──────────────────────────────────────────────
  useEffect(() => {
    if (songDebounceRef.current) clearTimeout(songDebounceRef.current);

    const q = songSearchInput.trim();
    if (!q) {
      setSongResults([]);
      return;
    }

    songDebounceRef.current = setTimeout(() => {
      handleSearchSongs(q);
    }, 400);

    return () => {
      if (songDebounceRef.current) clearTimeout(songDebounceRef.current);
    };
  }, [songSearchInput]);

  // ── Parse artist/title from YouTube title ─────────────────────────────
  const parseYtTitle = (raw: string): { artist: string; title: string } => {
    let artist = '';
    let title = raw;

    const separators = [' - ', ' — ', ' | '];
    for (const sep of separators) {
      if (raw.includes(sep)) {
        const parts = raw.split(sep);
        artist = parts[0].trim();
        title = parts.slice(1).join(sep).trim();
        break;
      }
    }

    title = title
      .replace(/\s*[\(\[].*?(official|video|audio|lyrics|hd|4k|visualizer|music video).*?[\)\]]\s*/gi, '')
      .replace(/\s*[\(\[].*?[\)\]]\s*$/, '')
      .trim();

    return { artist, title };
  };

  // ── Add song to download list ─────────────────────────────────────────
  const addSongEntry = (result: YtSearchResult) => {
    const { artist, title } = parseYtTitle(result.title);

    setSongEntries(prev => {
      if (prev.some(e => e.ytResult.id === result.id)) {
        return prev;
      }
      return [...prev, {
        ytResult: result,
        artist,
        album: '',
        title,
        year: new Date().getFullYear().toString(),
        genre: songGenre || 'Rock',
      }];
    });
  };

  const removeSongEntry = (id: string) => {
    setSongEntries(prev => prev.filter(e => e.ytResult.id !== id));
  };

  const updateSongEntry = (id: string, field: keyof Omit<SongEntry, 'ytResult'>, value: string) => {
    setSongEntries(prev => prev.map(e => {
      if (e.ytResult.id === id) {
        return { ...e, [field]: value };
      }
      return e;
    }));
  };

  // ── Download selected songs ───────────────────────────────────────────
  const handleDownloadSongs = useCallback(async () => {
    if (songEntries.length === 0) {
      onToast('No songs added for download');
      return;
    }

    const songs = songEntries.map(e => ({
      title: e.title,
      artist: e.artist || 'Unknown Artist',
      album: e.album,
      year: e.year,
      genre: e.genre || songGenre || 'Rock',
      track_num: null as number | null,
    }));

    const videoIds = songEntries.map(e => e.ytResult.id);

    try {
      await invoke('downloader_download_songs', { songs, videoIds });
      onToast(`Queued ${songs.length} song${songs.length > 1 ? 's' : ''} for download`);
      setSongEntries([]);
      setJustSubmitted(true);
      setTimeout(() => setJustSubmitted(false), 2000);
    } catch (e: any) {
      onToast(`Download failed: ${e}`);
    }
  }, [songEntries, songGenre, onToast]);

  // ── Start download (manual mode) ──────────────────────────────────────
  const handleDownloadManual = useCallback(async () => {
    const valid = manualEntries.filter(e => e.artist.trim() && e.album.trim());
    if (valid.length === 0) {
      onToast('Fill in at least one album');
      return;
    }

    const albums = valid.map(e => ({
      artist: e.artist.trim(),
      album: e.album.trim(),
      year: e.year.trim(),
      genre: e.genre.trim() || 'Rock',
      tracks: null as string[] | null,
      prefer_clean: preferClean,
    }));

    try {
      await invoke('downloader_start', { albums });
      onToast(`Queued ${albums.length} album${albums.length > 1 ? 's' : ''} for download`);
      setManualEntries([{ artist: '', album: '', year: '', genre: '' }]);
      setJustSubmitted(true);
      setTimeout(() => setJustSubmitted(false), 2000);
    } catch (e: any) {
      onToast(`Download failed: ${e}`);
    }
  }, [manualEntries, preferClean, onToast]);

  // ── After all downloads complete ───────────────────────────────────────
  const handleAllComplete = useCallback(async () => {
    if (serverState.isConnected && serverState.serverUrl) {
      try {
        const savedConfig = localStorage.getItem('lumina-server-config');
        if (savedConfig) {
          const { url, username, password } = JSON.parse(savedConfig);
          await invoke('downloader_trigger_scan', { serverUrl: url, username, password });
          onToast('Navidrome rescan triggered');
          setTimeout(() => {
            refreshAlbums();
            refreshArtists();
          }, 3000);
        }
      } catch (e: any) {
        onToast(`Rescan failed: ${e}`);
      }
    }
  }, [serverState, onToast, refreshAlbums, refreshArtists]);

  // ── Manual entry helpers ───────────────────────────────────────────────
  const updateManualEntry = (index: number, field: keyof ManualAlbum, value: string) => {
    setManualEntries(prev => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const addManualEntry = () => {
    setManualEntries(prev => [...prev, { artist: '', album: '', year: '', genre: '' }]);
  };

  const removeManualEntry = (index: number) => {
    if (manualEntries.length <= 1) return;
    setManualEntries(prev => prev.filter((_, i) => i !== index));
  };

  const getCoverUrl = (rgId: string) =>
    `https://coverartarchive.org/release-group/${rgId}/front-250`;

  // ── Category counts ──────────────────────────────────────────────────
  const categoryCounts = discography.reduce((acc, a) => {
    acc[a.category] = (acc[a.category] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Categories that actually have albums
  const activeCategories = CATEGORY_ORDER.filter(cat => (categoryCounts[cat] || 0) > 0);

  const totalCount = discography.length;
  const studioCount = categoryCounts['studio_album'] || 0;

  // Group filtered albums by category for display
  const groupedAlbums = CATEGORY_ORDER.reduce((acc, cat) => {
    const albums = filteredDiscography.filter(a => a.category === cat);
    if (albums.length > 0) acc.push({ category: cat, albums });
    return acc;
  }, [] as { category: ReleaseCategory; albums: ClassifiedAlbum[] }[]);

  return (
    <div className="pb-48">
      {/* Header */}
      <div className="mb-10">
        <h2 className="text-sm font-bold tracking-[0.2em] text-white/40 uppercase mb-2">Plugin</h2>
        <h1 className="text-4xl font-bold tracking-tight">Downloader</h1>
        <p className="text-sm text-white/30 mt-2">
          Download albums by artist, individual songs, or enter manually. Auto-tagged with MusicBrainz metadata.
        </p>
      </div>

      {/* Settings toggle */}
      <div className="mb-6">
        <button
          onClick={() => setShowSettings(s => !s)}
          className="flex items-center gap-2 text-xs text-white/30 hover:text-white/60 transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className={`transition-transform ${showSettings ? 'rotate-90' : ''}`}>
            <path d="M5.25 3.5L8.75 7L5.25 10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span className="uppercase tracking-widest font-medium">Settings</span>
          {musicDir && !showSettings && (
            <span className="text-white/15 font-normal normal-case tracking-normal ml-1 truncate max-w-[300px]">{musicDir}</span>
          )}
        </button>

        {showSettings && (
          <div className="mt-3 bg-white/[0.03] border border-white/5 rounded-xl p-4 space-y-3">
            <div>
              <label className="text-xs text-white/40 font-medium uppercase tracking-widest block mb-2">
                Download Directory
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={musicDirInput}
                  onChange={e => setMusicDirInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSaveMusicDir(); }}
                  placeholder="/home/user/Music"
                  className="flex-1 bg-white/5 border border-white/5 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-white/20 transition-colors font-mono"
                />
                <button
                  onClick={handleSaveMusicDir}
                  disabled={isSavingDir || musicDirInput.trim() === musicDir || !musicDirInput.trim()}
                  className="px-4 py-2 bg-white/10 text-white/70 rounded-lg text-sm font-medium hover:bg-white/15 disabled:opacity-30 disabled:hover:bg-white/10 transition-all"
                >
                  {isSavingDir ? 'Saving...' : 'Save'}
                </button>
              </div>
              <p className="text-[11px] text-white/20 mt-1.5">
                Music is saved as: <span className="text-white/30 font-mono">{'{dir}/{artist}/{album}/01-track.mp3'}</span>
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white/5 rounded-xl p-1 w-fit mb-8 border border-white/5">
        <button
          onClick={() => setActiveTab('search')}
          className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'search' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/70'
          }`}
        >
          Discography
        </button>
        <button
          onClick={() => setActiveTab('songs')}
          className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'songs' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/70'
          }`}
        >
          Songs
        </button>
        <button
          onClick={() => setActiveTab('manual')}
          className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'manual' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/70'
          }`}
        >
          Manual
        </button>
      </div>

      <div className="flex gap-8 flex-col lg:flex-row">
        {/* ── Left column ──────────────────────────────────────── */}
        <div className="flex-1 min-w-0">
          {activeTab === 'search' ? (
            <div className="space-y-6">
              {/* Search bar with inline spinner */}
              <div className="relative">
                <input
                  type="text"
                  placeholder="Artist name..."
                  value={searchInput}
                  onChange={e => setSearchInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
                      handleSearch();
                    }
                  }}
                  className="w-full bg-white/5 border border-white/5 rounded-xl px-5 py-3 pr-12 text-sm text-white placeholder:text-white/20 focus:outline-none focus:bg-white/10 focus:border-white/20 transition-colors"
                />
                {isSearching && (
                  <div className="absolute right-4 top-1/2 -translate-y-1/2">
                    <InlineSpinner />
                  </div>
                )}
              </div>

              {/* Auto-selected notice */}
              {autoSelectedName && selectedArtist && !isLoadingDiscography && discography.length > 0 && (
                <div className="text-xs text-white/30">
                  Showing results for: <span className="text-white/50 font-medium">{autoSelectedName}</span>
                </div>
              )}

              {/* Artist disambiguation (if multiple results and none auto-selected) */}
              {artistResults.length > 1 && !selectedArtist && (
                <div className="space-y-2">
                  <h3 className="text-xs font-bold tracking-[0.2em] text-white/40 uppercase">
                    Pick the right artist
                  </h3>
                  <div className="space-y-1">
                    {artistResults.map(a => (
                      <button
                        key={a.id}
                        onClick={() => handleSelectArtist(a)}
                        className="w-full flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/5 hover:bg-white/5 text-left transition-colors"
                      >
                        <span className="text-sm font-semibold">{a.name}</span>
                        {a.disambiguation && (
                          <span className="text-xs text-white/30">{a.disambiguation}</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Loading discography */}
              {isLoadingDiscography && (
                <div className="flex items-center gap-3 py-12 justify-center text-white/30 text-sm">
                  <span className="w-4 h-4 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
                  Loading discography for {selectedArtist?.name}...
                </div>
              )}

              {/* Discography loaded */}
              {selectedArtist && !isLoadingDiscography && discography.length > 0 && (
                <div className="space-y-4">
                  {/* Artist header + back */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => { setSelectedArtist(null); setAutoSelectedName(null); setDiscography([]); setSelected(new Set()); setDiscographySearch(''); setCategoryFilter('all'); }}
                        className="text-xs text-white/30 hover:text-white transition-colors"
                      >
                        &larr; Back
                      </button>
                      <h3 className="text-lg font-bold">{selectedArtist.name}</h3>
                      <span className="text-xs text-white/30">
                        {totalCount} releases
                        {selected.size > 0 && (
                          <> &middot; <span className="text-purple-400">{selected.size} selected</span></>
                        )}
                      </span>
                    </div>
                    <button
                      onClick={selectAll}
                      className="text-xs text-white/40 hover:text-white transition-colors font-medium"
                    >
                      {filteredDiscography.every(a => selected.has(a.id)) && filteredDiscography.length > 0
                        ? 'Deselect All'
                        : 'Select All'}
                    </button>
                  </div>

                  {/* Download All Studio Albums button */}
                  {studioCount > 0 && (
                    <button
                      onClick={handleDownloadAllStudios}
                      className="w-full py-3.5 bg-white text-black rounded-xl font-bold text-sm hover:bg-white/90 transition-all flex items-center justify-center gap-2"
                    >
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <path d="M8 2v8m0 0l-3-3m3 3l3-3M3 12h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      Download All {studioCount} Studio Album{studioCount !== 1 ? 's' : ''}
                    </button>
                  )}

                  {/* Filter within discography */}
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Filter releases..."
                      value={discographySearch}
                      onChange={e => setDiscographySearch(e.target.value)}
                      className="w-full bg-white/5 border border-white/5 rounded-xl px-4 py-2.5 pr-8 text-sm text-white placeholder:text-white/20 focus:outline-none focus:bg-white/10 focus:border-white/20 transition-colors"
                    />
                    {discographySearch && (
                      <button
                        onClick={() => setDiscographySearch('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-white/20 hover:text-white/60 transition-colors text-xs"
                      >
                        &times;
                      </button>
                    )}
                  </div>

                  {/* Category filters + options */}
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex gap-1 bg-white/5 rounded-lg p-1 border border-white/5 flex-wrap">
                      <button
                        onClick={() => setCategoryFilter('all')}
                        className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                          categoryFilter === 'all' ? 'bg-white/10 text-white' : 'text-white/30 hover:text-white/60'
                        }`}
                      >
                        All ({totalCount})
                      </button>
                      {activeCategories.map(cat => (
                        <button
                          key={cat}
                          onClick={() => setCategoryFilter(cat)}
                          className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                            categoryFilter === cat ? 'bg-white/10 text-white' : 'text-white/30 hover:text-white/60'
                          }`}
                        >
                          {CATEGORY_LABELS[cat]} ({categoryCounts[cat]})
                        </button>
                      ))}
                    </div>

                    <label className="flex items-center gap-2 text-xs text-white/30 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={preferClean}
                        onChange={e => setPreferClean(e.target.checked)}
                        className="accent-purple-500"
                      />
                      Clean
                    </label>

                    <div className="flex items-center gap-2 ml-auto">
                      <span className="text-xs text-white/30 font-medium uppercase tracking-widest">Genre</span>
                      <input
                        type="text"
                        placeholder="Rock"
                        value={genreOverride}
                        onChange={e => setGenreOverride(e.target.value)}
                        className="bg-white/5 border border-white/5 rounded-lg px-3 py-1.5 text-xs text-white placeholder:text-white/20 focus:outline-none focus:border-white/20 transition-colors w-32"
                      />
                    </div>
                  </div>

                  {/* Albums grouped by category */}
                  {groupedAlbums.map(({ category: cat, albums }) => {
                    const isCollapsed = collapsedCategories.has(cat);
                    const selectedInCat = albums.filter(a => selected.has(a.id)).length;
                    const allSelectedInCat = selectedInCat === albums.length;
                    return (
                      <div key={cat}>
                        {/* Category header */}
                        {categoryFilter === 'all' && (
                          <div className="flex items-center gap-3 mb-3">
                            <button
                              onClick={() => toggleCategoryCollapse(cat)}
                              className="flex items-center gap-2 text-xs font-bold tracking-[0.15em] text-white/40 uppercase hover:text-white/60 transition-colors"
                            >
                              <svg
                                width="10" height="10" viewBox="0 0 10 10" fill="none"
                                className={`transition-transform ${isCollapsed ? '' : 'rotate-90'}`}
                              >
                                <path d="M3 1.5L7 5L3 8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                              {CATEGORY_LABELS[cat]} ({albums.length})
                            </button>
                            {selectedInCat > 0 && (
                              <span className="text-[10px] text-purple-400">{selectedInCat} selected</span>
                            )}
                            <button
                              onClick={() => {
                                const ids = albums.map(a => a.id);
                                setSelected(prev => {
                                  const next = new Set(prev);
                                  if (allSelectedInCat) {
                                    ids.forEach(id => next.delete(id));
                                  } else {
                                    ids.forEach(id => next.add(id));
                                  }
                                  return next;
                                });
                              }}
                              className="text-[10px] text-white/20 hover:text-white/50 transition-colors"
                            >
                              {allSelectedInCat ? 'deselect' : 'select all'}
                            </button>
                          </div>
                        )}

                        {/* Album grid for this category */}
                        {!isCollapsed && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {albums.map((album, idx) => {
                              const isSelected = selected.has(album.id);
                              const globalIdx = filteredDiscography.indexOf(album);
                              return (
                                <button
                                  key={album.id}
                                  onClick={(e) => toggleSelect(album.id, globalIdx, e.shiftKey)}
                                  className={`flex items-center gap-4 p-3 rounded-xl border text-left transition-all ${
                                    isSelected
                                      ? 'bg-white/10 border-purple-500/40 shadow-[0_0_20px_rgba(168,85,247,0.05)]'
                                      : 'bg-white/[0.02] border-white/5 hover:bg-white/5'
                                  }`}
                                >
                                  <LazyImage
                                    src={getCoverUrl(album.id)}
                                    alt=""
                                    className="w-14 h-14 rounded-lg bg-white/5 flex-shrink-0 overflow-hidden"
                                  />
                                  <div className="min-w-0 flex-1">
                                    <div className="text-sm font-semibold truncate">{album.title}</div>
                                    <div className="text-xs text-white/30 flex items-center gap-2 mt-0.5">
                                      {album.year && <span>{album.year}</span>}
                                      {album.sources.length > 1 && (
                                        <span className="px-1.5 py-0.5 bg-green-500/10 text-green-400/60 rounded text-[10px]" title={`Confirmed by ${album.sources.join(' + ')}`}>
                                          verified
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <div className={`w-5 h-5 rounded-md border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                                    isSelected ? 'bg-purple-500 border-purple-500' : 'border-white/20'
                                  }`}>
                                    {isSelected && (
                                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                                        <path d="M2.5 6L5 8.5L9.5 3.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                      </svg>
                                    )}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {filteredDiscography.length === 0 && (
                    <div className="text-center py-8 text-white/20 text-sm">
                      No releases match the current filters
                    </div>
                  )}
                </div>
              )}

              {/* Empty states */}
              {!isSearching && !isLoadingDiscography && discography.length === 0 && !selectedArtist && artistResults.length === 0 && (
                <div className="text-center py-16 text-white/20 text-sm">
                  Type an artist name to browse their discography
                </div>
              )}
            </div>
          ) : activeTab === 'songs' ? (
            /* ── Song Search Tab ──────────────────────────────────── */
            <div className="space-y-6">
              {/* Search bar with inline spinner */}
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search for a song..."
                  value={songSearchInput}
                  onChange={e => setSongSearchInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      if (songDebounceRef.current) clearTimeout(songDebounceRef.current);
                      handleSearchSongs();
                    }
                  }}
                  className="w-full bg-white/5 border border-white/5 rounded-xl px-5 py-3 pr-12 text-sm text-white placeholder:text-white/20 focus:outline-none focus:bg-white/10 focus:border-white/20 transition-colors"
                />
                {isSearchingSongs && (
                  <div className="absolute right-4 top-1/2 -translate-y-1/2">
                    <InlineSpinner />
                  </div>
                )}
              </div>

              {/* Default genre */}
              <div className="flex items-center gap-3">
                <span className="text-xs text-white/30 font-medium uppercase tracking-widest">Default Genre</span>
                <input
                  type="text"
                  placeholder="Rock"
                  value={songGenre}
                  onChange={e => setSongGenre(e.target.value)}
                  className="bg-white/5 border border-white/5 rounded-lg px-3 py-1.5 text-xs text-white placeholder:text-white/20 focus:outline-none focus:border-white/20 transition-colors w-32"
                />
              </div>

              {/* Search Results */}
              {songResults.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-xs font-bold tracking-[0.2em] text-white/40 uppercase">
                    Search Results
                  </h3>
                  <div className="space-y-1.5">
                    {songResults.map(result => {
                      const isAdded = songEntries.some(e => e.ytResult.id === result.id);
                      const parsed = parseYtTitle(result.title);
                      return (
                        <button
                          key={result.id}
                          onClick={() => !isAdded && addSongEntry(result)}
                          disabled={isAdded}
                          className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all group ${
                            isAdded
                              ? 'bg-white/5 border-purple-500/30 opacity-40'
                              : 'bg-white/[0.02] border-white/5 hover:bg-white/5 hover:border-white/10'
                          }`}
                        >
                          <div className="w-12 h-12 rounded-lg bg-white/5 flex-shrink-0 overflow-hidden">
                            <img
                              src={`https://i.ytimg.com/vi/${result.id}/default.jpg`}
                              alt=""
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                          </div>
                          <div className="min-w-0 flex-1">
                            {/* Parsed title (what will be saved) */}
                            <div className="text-sm font-medium truncate">
                              {parsed.title}
                            </div>
                            {/* Parsed artist + duration */}
                            <div className="text-xs text-white/30 flex items-center gap-1.5 mt-0.5">
                              {parsed.artist ? (
                                <span className="truncate">{parsed.artist}</span>
                              ) : (
                                <span className="truncate text-white/20">{result.channel}</span>
                              )}
                              <span className="text-white/15 flex-shrink-0">&middot;</span>
                              <span className="flex-shrink-0">{result.duration}</span>
                            </div>
                            {/* Original YouTube title if different */}
                            {(parsed.artist || parsed.title !== result.title) && (
                              <div className="text-[10px] text-white/15 truncate mt-0.5">{result.title}</div>
                            )}
                          </div>
                          <div className={`px-3 py-1.5 rounded-lg text-xs font-medium flex-shrink-0 transition-colors ${
                            isAdded
                              ? 'bg-purple-500/20 text-purple-300'
                              : 'bg-white/5 text-white/30 group-hover:bg-white/10 group-hover:text-white'
                          }`}>
                            {isAdded ? 'Added' : '+ Add'}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Selected songs for download */}
              {songEntries.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold tracking-[0.2em] text-white/40 uppercase">
                      Download List ({songEntries.length})
                    </h3>
                    <button
                      onClick={() => { setSongEntries([]); setExpandedSongId(null); }}
                      className="text-xs text-white/30 hover:text-red-400 transition-colors"
                    >
                      Clear All
                    </button>
                  </div>
                  <div className="space-y-1.5">
                    {songEntries.map(entry => {
                      const isExpanded = expandedSongId === entry.ytResult.id;
                      return (
                        <div
                          key={entry.ytResult.id}
                          className="bg-white/[0.03] border border-white/5 rounded-xl overflow-hidden"
                        >
                          {/* Compact row */}
                          <div className="flex items-center gap-3 p-3">
                            <div className="w-10 h-10 rounded-lg bg-white/5 flex-shrink-0 overflow-hidden">
                              <img
                                src={`https://i.ytimg.com/vi/${entry.ytResult.id}/default.jpg`}
                                alt=""
                                className="w-full h-full object-cover"
                              />
                            </div>
                            <button
                              onClick={() => setExpandedSongId(isExpanded ? null : entry.ytResult.id)}
                              className="min-w-0 flex-1 text-left"
                            >
                              <div className="text-sm font-medium truncate">{entry.title || 'Untitled'}</div>
                              <div className="text-xs text-white/30 truncate">
                                {entry.artist || 'Unknown Artist'}
                                {entry.album && <> &middot; {entry.album}</>}
                              </div>
                            </button>
                            <button
                              onClick={() => setExpandedSongId(isExpanded ? null : entry.ytResult.id)}
                              className="text-white/20 hover:text-white/50 transition-colors flex-shrink-0 p-1"
                            >
                              <svg
                                width="14" height="14" viewBox="0 0 14 14" fill="none"
                                className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                              >
                                <path d="M3.5 5.25L7 8.75L10.5 5.25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            </button>
                            <button
                              onClick={() => { removeSongEntry(entry.ytResult.id); if (isExpanded) setExpandedSongId(null); }}
                              className="text-white/15 hover:text-red-400 transition-colors flex-shrink-0 p-1"
                            >
                              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                                <path d="M3.5 3.5L10.5 10.5M10.5 3.5L3.5 10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                              </svg>
                            </button>
                          </div>

                          {/* Expanded edit fields */}
                          {isExpanded && (
                            <div className="border-t border-white/5 p-3 space-y-2">
                              <div className="text-[10px] text-white/15 truncate mb-2">
                                Source: {entry.ytResult.title} &middot; {entry.ytResult.duration}
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <input
                                  type="text"
                                  placeholder="Title"
                                  value={entry.title}
                                  onChange={e => updateSongEntry(entry.ytResult.id, 'title', e.target.value)}
                                  className="bg-white/5 border border-white/5 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-white/20 transition-colors"
                                />
                                <input
                                  type="text"
                                  placeholder="Artist"
                                  value={entry.artist}
                                  onChange={e => updateSongEntry(entry.ytResult.id, 'artist', e.target.value)}
                                  className="bg-white/5 border border-white/5 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-white/20 transition-colors"
                                />
                                <input
                                  type="text"
                                  placeholder="Album (optional)"
                                  value={entry.album}
                                  onChange={e => updateSongEntry(entry.ytResult.id, 'album', e.target.value)}
                                  className="bg-white/5 border border-white/5 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-white/20 transition-colors"
                                />
                                <div className="flex gap-2">
                                  <input
                                    type="text"
                                    placeholder="Year"
                                    value={entry.year}
                                    onChange={e => updateSongEntry(entry.ytResult.id, 'year', e.target.value)}
                                    className="flex-1 bg-white/5 border border-white/5 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-white/20 transition-colors"
                                  />
                                  <input
                                    type="text"
                                    placeholder="Genre"
                                    value={entry.genre}
                                    onChange={e => updateSongEntry(entry.ytResult.id, 'genre', e.target.value)}
                                    className="flex-1 bg-white/5 border border-white/5 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-white/20 transition-colors"
                                  />
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Download button */}
                  <div className="pt-2">
                    <button
                      onClick={handleDownloadSongs}
                      className="w-full py-4 bg-white text-black rounded-xl font-bold text-sm hover:bg-white/90 transition-all"
                    >
                      {`Download ${songEntries.length} Song${songEntries.length > 1 ? 's' : ''}`}
                    </button>
                  </div>
                </div>
              )}

              {/* Tip */}
              {songEntries.length > 0 && (
                <div className="text-xs text-white/20 text-center">
                  Click a song in the download list to edit its metadata.
                </div>
              )}

              {/* Empty state */}
              {!isSearchingSongs && songResults.length === 0 && songEntries.length === 0 && (
                <div className="text-center py-16 text-white/20 text-sm space-y-2">
                  <div>Search for any song on YouTube to download it</div>
                  <div className="text-xs text-white/10">
                    Results are auto-parsed for artist/title, but you can edit before downloading
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* ── Manual Entry Tab ──────────────────────────────────── */
            <div className="space-y-4">
              {manualEntries.map((entry, i) => (
                <div
                  key={i}
                  className="bg-white/[0.03] border border-white/5 rounded-2xl p-5 space-y-3"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-white/20 font-mono">#{i + 1}</span>
                    {manualEntries.length > 1 && (
                      <button
                        onClick={() => removeManualEntry(i)}
                        className="text-xs text-white/20 hover:text-red-400 transition-colors"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      type="text"
                      placeholder="Artist"
                      value={entry.artist}
                      onChange={e => updateManualEntry(i, 'artist', e.target.value)}
                      className="bg-white/5 border border-white/5 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-white/20 transition-colors"
                    />
                    <input
                      type="text"
                      placeholder="Album"
                      value={entry.album}
                      onChange={e => updateManualEntry(i, 'album', e.target.value)}
                      className="bg-white/5 border border-white/5 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-white/20 transition-colors"
                    />
                    <input
                      type="text"
                      placeholder="Year"
                      value={entry.year}
                      onChange={e => updateManualEntry(i, 'year', e.target.value)}
                      className="bg-white/5 border border-white/5 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-white/20 transition-colors"
                    />
                    <input
                      type="text"
                      placeholder="Genre (default: Rock)"
                      value={entry.genre}
                      onChange={e => updateManualEntry(i, 'genre', e.target.value)}
                      className="bg-white/5 border border-white/5 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-white/20 transition-colors"
                    />
                  </div>
                </div>
              ))}

              <button
                onClick={addManualEntry}
                className="w-full py-3 border border-dashed border-white/10 rounded-xl text-xs text-white/30 hover:text-white/60 hover:border-white/20 transition-colors font-medium uppercase tracking-widest"
              >
                + Add Another Album
              </button>

              <div className="pt-2">
                <button
                  onClick={handleDownloadManual}
                  disabled={!manualEntries.some(e => e.artist.trim() && e.album.trim())}
                  className="w-full py-4 bg-white text-black rounded-xl font-bold text-sm hover:bg-white/90 disabled:opacity-30 transition-all"
                >
                  {`Download ${manualEntries.filter(e => e.artist.trim() && e.album.trim()).length} Album${manualEntries.filter(e => e.artist.trim() && e.album.trim()).length !== 1 ? 's' : ''}`}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Right column: Download Queue ──────────────────────── */}
        <div className="lg:w-80 flex-shrink-0">
          <DownloadQueue onToast={onToast} onAllComplete={handleAllComplete} ipc={api.ipc} />
        </div>
      </div>

      {/* ── Sticky bottom action bar (discography tab) ─────────── */}
      {activeTab === 'search' && selected.size > 0 && (
        <div className="sticky bottom-6 z-50 flex justify-center">
          <div className="bg-black/80 backdrop-blur-xl border border-white/10 rounded-2xl px-6 py-4 flex items-center gap-4 shadow-2xl">
            <span className="text-sm text-white/60">
              <span className="text-white font-semibold">{selected.size}</span> album{selected.size > 1 ? 's' : ''} selected
            </span>
            <button
              onClick={() => setSelected(new Set())}
              className="text-xs text-white/30 hover:text-white transition-colors"
            >
              Clear
            </button>
            <button
              onClick={handleDownloadSelected}
              className="px-6 py-2.5 bg-white text-black rounded-xl font-bold text-sm hover:bg-white/90 transition-all"
            >
              Download
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
