import React, { useState, useCallback, useRef, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { PluginViewProps } from '../../types';
import { useServer } from '../../context/ServerContext';
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
type TypeFilter = 'all' | 'album' | 'ep' | 'single' | 'other';

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

export const DownloaderView: React.FC<PluginViewProps> = ({ onToast }) => {
  const { state: serverState, refreshAlbums, refreshArtists } = useServer();

  const [activeTab, setActiveTab] = useState<Tab>('search');

  // ── Search flow state ──────────────────────────────────────────────────
  const [searchInput, setSearchInput] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [artistResults, setArtistResults] = useState<MbArtist[]>([]);
  const [selectedArtist, setSelectedArtist] = useState<MbArtist | null>(null);
  const [isLoadingDiscography, setIsLoadingDiscography] = useState(false);
  const [discography, setDiscography] = useState<MbAlbum[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [genreOverride, setGenreOverride] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [hideCompilations, setHideCompilations] = useState(true);

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

  // ── Download state (tracks whether we just submitted, for brief button feedback) ──
  const [justSubmitted, setJustSubmitted] = useState(false);

  // ── Search for artists ─────────────────────────────────────────────────
  const handleSearch = useCallback(async () => {
    const query = searchInput.trim();
    if (!query) return;

    setIsSearching(true);
    setArtistResults([]);
    setSelectedArtist(null);
    setDiscography([]);
    setSelected(new Set());

    try {
      const results = await invoke<MbArtist[]>('downloader_search_artist', { artist: query });
      setArtistResults(results);
      // Auto-select if only one result or first is exact match
      if (results.length === 1) {
        handleSelectArtist(results[0]);
      } else if (results.length > 0 && results[0].name.toLowerCase() === query.toLowerCase()) {
        handleSelectArtist(results[0]);
      }
    } catch (e: any) {
      onToast(`Search failed: ${e}`);
    } finally {
      setIsSearching(false);
    }
  }, [searchInput, onToast]);

  // ── Select artist -> load discography ──────────────────────────────────
  const handleSelectArtist = useCallback(async (artist: MbArtist) => {
    setSelectedArtist(artist);
    setIsLoadingDiscography(true);
    setDiscography([]);
    setSelected(new Set());

    try {
      const albums = await invoke<MbAlbum[]>('downloader_get_discography', { artistId: artist.id });
      setDiscography(albums);
    } catch (e: any) {
      onToast(`Failed to load discography: ${e}`);
    } finally {
      setIsLoadingDiscography(false);
    }
  }, [onToast]);

  // ── Filter discography ─────────────────────────────────────────────────
  const filteredDiscography = discography.filter(a => {
    // Hide compilations/live/soundtrack if toggle is on
    if (hideCompilations && a.secondary_types.some(t =>
      ['Compilation', 'Live', 'Soundtrack', 'Remix', 'DJ-mix', 'Mixtape/Street', 'Demo', 'Interview', 'Spokenword'].includes(t)
    )) {
      // Exception: keep "Mixtape/Street" if filter is 'all' (user might want mixtapes)
      if (typeFilter !== 'all' || !a.secondary_types.includes('Mixtape/Street')) {
        return false;
      }
    }

    if (typeFilter === 'all') return true;
    if (typeFilter === 'album') return a.type === 'Album';
    if (typeFilter === 'ep') return a.type === 'EP';
    if (typeFilter === 'single') return a.type === 'Single';
    if (typeFilter === 'other') return !['Album', 'EP', 'Single'].includes(a.type);
    return true;
  });

  // ── Toggle album selection ─────────────────────────────────────────────
  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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
  }, [discography, selected, selectedArtist, genreOverride, onToast]);

  // ── Search for songs on YouTube ────────────────────────────────────────
  const handleSearchSongs = useCallback(async () => {
    const query = songSearchInput.trim();
    if (!query) return;

    setIsSearchingSongs(true);
    setSongResults([]);

    try {
      const results = await invoke<YtSearchResult[]>('downloader_search_songs', { query });
      setSongResults(results);
    } catch (e: any) {
      onToast(`Song search failed: ${e}`);
    } finally {
      setIsSearchingSongs(false);
    }
  }, [songSearchInput, onToast]);

  // ── Add song to download list ─────────────────────────────────────────
  const addSongEntry = (result: YtSearchResult) => {
    // Try to parse artist - title from the YouTube title
    let artist = '';
    let title = result.title;

    // Common patterns: "Artist - Song", "Artist — Song", "Artist | Song"
    const separators = [' - ', ' — ', ' | '];
    for (const sep of separators) {
      if (result.title.includes(sep)) {
        const parts = result.title.split(sep);
        artist = parts[0].trim();
        title = parts.slice(1).join(sep).trim();
        break;
      }
    }

    // Remove common suffixes like "(Official Video)", "[Lyrics]", etc.
    title = title
      .replace(/\s*[\(\[].*?(official|video|audio|lyrics|hd|4k|visualizer|music video).*?[\)\]]\s*/gi, '')
      .replace(/\s*[\(\[].*?[\)\]]\s*$/, '')
      .trim();

    setSongEntries(prev => {
      // Don't add duplicates
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

  // ── Remove song from download list ────────────────────────────────────
  const removeSongEntry = (id: string) => {
    setSongEntries(prev => prev.filter(e => e.ytResult.id !== id));
  };

  // ── Update song entry fields ──────────────────────────────────────────
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
  }, [manualEntries, onToast]);

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

  const typeLabel = (t: string) => {
    if (!t) return '';
    if (t === 'Album') return '';
    return t;
  };

  // ── Type filter counts (respects hideCompilations toggle) ──────────────
  const typeCounts = discography.reduce((acc, a) => {
    // Skip compilations/live/soundtracks if toggle is on (same logic as filter)
    if (hideCompilations && a.secondary_types.some(t =>
      ['Compilation', 'Live', 'Soundtrack', 'Remix', 'DJ-mix', 'Mixtape/Street', 'Demo', 'Interview', 'Spokenword'].includes(t)
    )) {
      return acc;
    }
    const key = ['Album', 'EP', 'Single'].includes(a.type) ? a.type.toLowerCase() : 'other';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Total visible count for "All" filter
  const totalVisibleCount = Object.values(typeCounts).reduce((sum, n) => sum + n, 0);

  return (
    <div className="pb-32">
      {/* Header */}
      <div className="mb-10">
        <h2 className="text-sm font-bold tracking-[0.2em] text-white/40 uppercase mb-2">Plugin</h2>
        <h1 className="text-4xl font-bold tracking-tight">Downloader</h1>
        <p className="text-sm text-white/30 mt-2">
          Download albums by artist, individual songs, or enter manually. Auto-tagged with MusicBrainz metadata.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white/5 rounded-xl p-1 w-fit mb-8 border border-white/5">
        <button
          onClick={() => setActiveTab('search')}
          className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'search' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/70'
          }`}
        >
          Albums
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
              {/* Search bar */}
              <div className="flex gap-3">
                <input
                  type="text"
                  placeholder="Artist name..."
                  value={searchInput}
                  onChange={e => setSearchInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSearch()}
                  className="flex-1 bg-white/5 border border-white/5 rounded-xl px-5 py-3 text-sm text-white placeholder:text-white/20 focus:outline-none focus:bg-white/10 focus:border-white/20 transition-colors"
                />
                <button
                  onClick={handleSearch}
                  disabled={isSearching || !searchInput.trim()}
                  className="px-6 py-3 bg-white/10 border border-white/5 rounded-xl text-sm font-semibold hover:bg-white/20 disabled:opacity-30 disabled:hover:bg-white/10 transition-colors"
                >
                  {isSearching ? (
                    <span className="flex items-center gap-2">
                      <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Searching
                    </span>
                  ) : 'Search'}
                </button>
              </div>

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
                        onClick={() => { setSelectedArtist(null); setDiscography([]); setSelected(new Set()); }}
                        className="text-xs text-white/30 hover:text-white transition-colors"
                      >
                        &larr; Back
                      </button>
                      <h3 className="text-lg font-bold">{selectedArtist.name}</h3>
                      <span className="text-xs text-white/30">{discography.length} releases</span>
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

                  {/* Filters */}
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex gap-1 bg-white/5 rounded-lg p-1 border border-white/5">
                      {(['all', 'album', 'ep', 'single', 'other'] as TypeFilter[]).map(f => {
                        const count = f === 'all' ? totalVisibleCount : (typeCounts[f] || 0);
                        return (
                          <button
                            key={f}
                            onClick={() => setTypeFilter(f)}
                            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                              typeFilter === f ? 'bg-white/10 text-white' : 'text-white/30 hover:text-white/60'
                            }`}
                          >
                            {f === 'all' ? 'All' : f.toUpperCase()}
                            {count > 0 ? ` (${count})` : ''}
                          </button>
                        );
                      })}
                    </div>

                    <label className="flex items-center gap-2 text-xs text-white/30 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={hideCompilations}
                        onChange={e => setHideCompilations(e.target.checked)}
                        className="accent-purple-500"
                      />
                      Hide compilations/live/soundtracks
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

                  {/* Album grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {filteredDiscography.map(album => {
                      const isSelected = selected.has(album.id);
                      return (
                        <button
                          key={album.id}
                          onClick={() => toggleSelect(album.id)}
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
                              {typeLabel(album.type) && (
                                <span className="px-1.5 py-0.5 bg-white/5 rounded text-[10px] uppercase tracking-wider">
                                  {typeLabel(album.type)}
                                </span>
                              )}
                              {album.secondary_types.length > 0 && (
                                <span className="text-[10px] text-white/20">
                                  {album.secondary_types.join(', ')}
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

                  {filteredDiscography.length === 0 && (
                    <div className="text-center py-8 text-white/20 text-sm">
                      No releases match the current filters
                    </div>
                  )}

                  {/* Download button */}
                  {selected.size > 0 && (
                    <div className="pt-4">
                      <button
                        onClick={handleDownloadSelected}
                        className="w-full py-4 bg-white text-black rounded-xl font-bold text-sm hover:bg-white/90 transition-all"
                      >
                        {`Download ${selected.size} Album${selected.size > 1 ? 's' : ''}`}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Empty states */}
              {!isSearching && !isLoadingDiscography && discography.length === 0 && !selectedArtist && artistResults.length === 0 && (
                <div className="text-center py-16 text-white/20 text-sm">
                  Search for an artist to browse their discography
                </div>
              )}
            </div>
          ) : activeTab === 'songs' ? (
            /* ── Song Search Tab ──────────────────────────────────── */
            <div className="space-y-6">
              {/* Search bar */}
              <div className="flex gap-3">
                <input
                  type="text"
                  placeholder="Search for a song..."
                  value={songSearchInput}
                  onChange={e => setSongSearchInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSearchSongs()}
                  className="flex-1 bg-white/5 border border-white/5 rounded-xl px-5 py-3 text-sm text-white placeholder:text-white/20 focus:outline-none focus:bg-white/10 focus:border-white/20 transition-colors"
                />
                <button
                  onClick={handleSearchSongs}
                  disabled={isSearchingSongs || !songSearchInput.trim()}
                  className="px-6 py-3 bg-white/10 border border-white/5 rounded-xl text-sm font-semibold hover:bg-white/20 disabled:opacity-30 disabled:hover:bg-white/10 transition-colors"
                >
                  {isSearchingSongs ? (
                    <span className="flex items-center gap-2">
                      <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Searching
                    </span>
                  ) : 'Search'}
                </button>
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
                  <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
                    {songResults.map(result => {
                      const isAdded = songEntries.some(e => e.ytResult.id === result.id);
                      return (
                        <button
                          key={result.id}
                          onClick={() => !isAdded && addSongEntry(result)}
                          disabled={isAdded}
                          className={`w-full flex items-center gap-4 p-3 rounded-xl border text-left transition-all ${
                            isAdded
                              ? 'bg-white/5 border-purple-500/30 opacity-50'
                              : 'bg-white/[0.02] border-white/5 hover:bg-white/5'
                          }`}
                        >
                          <div className="w-10 h-10 rounded-lg bg-white/5 flex-shrink-0 overflow-hidden">
                            <img
                              src={`https://i.ytimg.com/vi/${result.id}/default.jpg`}
                              alt=""
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium truncate">{result.title}</div>
                            <div className="text-xs text-white/30 flex items-center gap-2">
                              <span>{result.channel}</span>
                              <span className="text-white/20">•</span>
                              <span>{result.duration}</span>
                            </div>
                          </div>
                          <div className={`px-3 py-1 rounded-lg text-xs font-medium ${
                            isAdded
                              ? 'bg-purple-500/20 text-purple-300'
                              : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white'
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
                      onClick={() => setSongEntries([])}
                      className="text-xs text-white/30 hover:text-red-400 transition-colors"
                    >
                      Clear All
                    </button>
                  </div>
                  <div className="space-y-3">
                    {songEntries.map(entry => (
                      <div
                        key={entry.ytResult.id}
                        className="bg-white/[0.03] border border-white/5 rounded-2xl p-4 space-y-3"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <div className="w-10 h-10 rounded-lg bg-white/5 flex-shrink-0 overflow-hidden">
                              <img
                                src={`https://i.ytimg.com/vi/${entry.ytResult.id}/default.jpg`}
                                alt=""
                                className="w-full h-full object-cover"
                              />
                            </div>
                            <div className="min-w-0">
                              <div className="text-xs text-white/30 truncate">{entry.ytResult.title}</div>
                              <div className="text-[10px] text-white/20">{entry.ytResult.duration}</div>
                            </div>
                          </div>
                          <button
                            onClick={() => removeSongEntry(entry.ytResult.id)}
                            className="text-xs text-white/20 hover:text-red-400 transition-colors"
                          >
                            Remove
                          </button>
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
                    ))}
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
                  Tip: Songs without an album will be saved to a "Singles" folder for the artist.
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
          <DownloadQueue onToast={onToast} onAllComplete={handleAllComplete} />
        </div>
      </div>
    </div>
  );
};
