// Downloader Plugin - Standalone version
// Uses window.GuteMusik API instead of module imports

const { React, useState, useEffect, useCallback, useRef, invoke, listen } = window.GuteMusik;

// ── Types ──────────────────────────────────────────────────────────────────

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

interface DownloadProgress {
  album_index: number;
  total_albums: number;
  artist: string;
  album: string;
  track_index: number;
  total_tracks: number;
  track_name: string;
  status: string;
  error: string | null;
}

interface AlbumState {
  artist: string;
  album: string;
  status: string;
  completed_tracks: number;
  total_tracks: number;
  error: string | null;
  currentTrack?: string;
  currentTrackStatus?: string;
}

interface PluginViewProps {
  onPlayTrack: (track: any, queue?: any[]) => void;
  onNavigateToAlbum: (id: string) => void;
  onNavigateToArtist: (id: string) => void;
  onContextMenu: (e: React.MouseEvent, item: any, type: string) => void;
  onToast: (msg: string) => void;
  serverState: { isConnected: boolean; serverUrl: string | null };
  refreshAlbums: () => Promise<void>;
  refreshArtists: () => Promise<void>;
}

type Tab = 'search' | 'songs' | 'manual';
type TypeFilter = 'all' | 'album' | 'ep' | 'single' | 'other';

// ── Lazy loading image component ───────────────────────────────────────────

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

  return React.createElement('div', { ref: imgRef, className },
    isVisible && !hasError && React.createElement('img', {
      src,
      alt,
      className: 'w-full h-full object-cover',
      onError: () => setHasError(true),
      loading: 'lazy'
    })
  );
};

// ── Download Queue Component ───────────────────────────────────────────────

const DownloadQueue: React.FC<{ onToast: (msg: string) => void; onAllComplete: () => void }> = ({ onToast, onAllComplete }) => {
  const [albums, setAlbums] = useState<AlbumState[]>([]);
  const [isActive, setIsActive] = useState(false);

  // Poll state on mount
  useEffect(() => {
    const poll = async () => {
      try {
        const state = await invoke<{ is_active: boolean; albums: AlbumState[] }>('downloader_get_status');
        setIsActive(state.is_active);
        if (state.albums.length > 0) {
          setAlbums(prev => {
            const updated = [...state.albums];
            for (let i = 0; i < updated.length; i++) {
              if (prev[i]) {
                updated[i].currentTrack = prev[i].currentTrack;
                updated[i].currentTrackStatus = prev[i].currentTrackStatus;
              }
            }
            return updated;
          });
        } else {
          setAlbums([]);
        }
      } catch {}
    };
    poll();
    const interval = setInterval(poll, 2000);
    return () => clearInterval(interval);
  }, []);

  // Listen to progress events
  useEffect(() => {
    const unlisteners: (() => void)[] = [];

    listen<DownloadProgress>('download-progress', (event: any) => {
      const p = event.payload;
      setAlbums(prev => {
        const next = [...prev];
        if (next[p.album_index]) {
          next[p.album_index] = {
            ...next[p.album_index],
            completed_tracks: p.status === 'done' ? p.track_index + 1 : next[p.album_index].completed_tracks,
            total_tracks: p.total_tracks,
            currentTrack: p.track_name,
            currentTrackStatus: p.status,
          };
        }
        return next;
      });
    }).then((u: any) => unlisteners.push(u));

    listen('download-album-complete', (event: any) => {
      const { artist, album } = event.payload;
      onToast(`Finished: ${artist} - ${album}`);
    }).then((u: any) => unlisteners.push(u));

    listen('download-all-complete', () => {
      setIsActive(false);
      onToast('All downloads complete!');
      onAllComplete();
    }).then((u: any) => unlisteners.push(u));

    listen('download-cancelled', () => {
      setIsActive(false);
      onToast('Downloads cancelled');
    }).then((u: any) => unlisteners.push(u));

    listen('download-error', (event: any) => {
      const { artist, album, error } = event.payload;
      onToast(`Error: ${artist} - ${album}: ${error}`);
    }).then((u: any) => unlisteners.push(u));

    return () => { unlisteners.forEach(u => u()); };
  }, [onToast, onAllComplete]);

  const handleCancel = async () => {
    try {
      await invoke('downloader_cancel');
    } catch (e: any) {
      onToast(`Cancel failed: ${e}`);
    }
  };

  const handleClearFinished = useCallback(async () => {
    try {
      await invoke('downloader_clear_finished');
      setAlbums(prev => prev.filter(a =>
        a.status !== 'complete' && a.status !== 'error' && a.status !== 'cancelled'
      ));
    } catch (e: any) {
      onToast(`Clear failed: ${e}`);
    }
  }, [onToast]);

  if (albums.length === 0) return null;

  const hasFinished = albums.some(a =>
    a.status === 'complete' || a.status === 'error' || a.status === 'cancelled'
  );

  const activeCount = albums.filter(a =>
    a.status === 'pending' || a.status === 'downloading'
  ).length;

  const statusLabel = (s: string) => {
    switch (s) {
      case 'searching': return 'Searching YouTube...';
      case 'downloading': return 'Downloading...';
      case 'tagging': return 'Tagging...';
      case 'done': return 'Done';
      case 'complete': return 'Complete';
      case 'error': return 'Error';
      case 'cancelled': return 'Cancelled';
      case 'pending': return 'Waiting...';
      case 'fetching_cover': return 'Fetching cover art...';
      case 'fetching_tracklist': return 'Fetching tracklist...';
      default: return s;
    }
  };

  const statusColor = (s: string) => {
    switch (s) {
      case 'complete': return 'text-emerald-400';
      case 'error': return 'text-red-400';
      case 'cancelled': return 'text-orange-400';
      case 'downloading': return 'text-blue-400';
      default: return 'text-white/50';
    }
  };

  const statusDot = (s: string) => {
    switch (s) {
      case 'complete': return 'bg-emerald-400';
      case 'error': return 'bg-red-400';
      case 'cancelled': return 'bg-orange-400';
      case 'downloading': return 'bg-blue-400 animate-pulse';
      case 'pending': return 'bg-white/20';
      default: return 'bg-white/20';
    }
  };

  return React.createElement('div', { className: 'space-y-3' },
    React.createElement('div', { className: 'flex items-center justify-between mb-4' },
      React.createElement('h3', { className: 'text-xs font-bold tracking-[0.2em] text-white/40 uppercase' },
        'Download Queue',
        activeCount > 0 && React.createElement('span', { className: 'ml-2 text-white/60' }, `${activeCount} active`)
      ),
      React.createElement('div', { className: 'flex items-center gap-3' },
        hasFinished && React.createElement('button', {
          onClick: handleClearFinished,
          className: 'text-xs text-white/30 hover:text-white/60 transition-colors font-medium tracking-wide'
        }, 'Clear Done'),
        isActive && React.createElement('button', {
          onClick: handleCancel,
          className: 'text-xs text-red-400/70 hover:text-red-400 transition-colors font-medium tracking-wide'
        }, 'Cancel All')
      )
    ),
    ...albums.map((a, i) => {
      const progress = a.total_tracks > 0 ? (a.completed_tracks / a.total_tracks) * 100 : 0;
      const isFinished = a.status === 'complete' || a.status === 'error' || a.status === 'cancelled';

      return React.createElement('div', {
        key: `${a.artist}-${a.album}-${i}`,
        className: `bg-white/[0.03] border border-white/5 rounded-2xl p-5 space-y-3 transition-opacity ${isFinished ? 'opacity-50' : ''}`
      },
        React.createElement('div', { className: 'flex items-start justify-between gap-4' },
          React.createElement('div', { className: 'min-w-0' },
            React.createElement('div', { className: 'text-sm font-semibold truncate' }, a.album),
            React.createElement('div', { className: 'text-xs text-white/40 truncate' }, a.artist)
          ),
          React.createElement('div', { className: 'flex items-center gap-2 flex-shrink-0' },
            React.createElement('div', { className: `w-2 h-2 rounded-full ${statusDot(a.status)}` }),
            React.createElement('span', { className: `text-xs font-medium capitalize ${statusColor(a.status)}` }, statusLabel(a.status))
          )
        ),
        a.total_tracks > 0 && a.status !== 'complete' && React.createElement('div', { className: 'space-y-2' },
          React.createElement('div', { className: 'w-full h-1 bg-white/5 rounded-full overflow-hidden' },
            React.createElement('div', {
              className: 'h-full bg-gradient-to-r from-purple-500 to-blue-500 rounded-full transition-all duration-500 ease-out',
              style: { width: `${progress}%` }
            })
          ),
          React.createElement('div', { className: 'flex items-center justify-between text-[10px] text-white/30 font-mono' },
            React.createElement('span', null, `${a.completed_tracks}/${a.total_tracks} tracks`),
            React.createElement('span', null, `${Math.round(progress)}%`)
          )
        ),
        a.currentTrack && a.status === 'downloading' && React.createElement('div', { className: 'text-[11px] text-white/30 truncate' },
          React.createElement('span', { className: 'text-white/50' }, statusLabel(a.currentTrackStatus || '')),
          ' ',
          a.currentTrack
        ),
        a.error && React.createElement('div', { className: 'text-[11px] text-red-400/70 truncate' }, a.error)
      );
    })
  );
};

// ── Main Downloader View ───────────────────────────────────────────────────

const DownloaderView: React.FC<PluginViewProps> = ({ onToast, serverState, refreshAlbums, refreshArtists }) => {
  const [activeTab, setActiveTab] = useState<Tab>('search');

  // Search flow state
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

  // Manual mode state
  const [manualEntries, setManualEntries] = useState<ManualAlbum[]>([
    { artist: '', album: '', year: '', genre: '' },
  ]);

  // Song search state
  const [songSearchInput, setSongSearchInput] = useState('');
  const [isSearchingSongs, setIsSearchingSongs] = useState(false);
  const [songResults, setSongResults] = useState<YtSearchResult[]>([]);
  const [songEntries, setSongEntries] = useState<SongEntry[]>([]);
  const [songGenre, setSongGenre] = useState('');

  const [justSubmitted, setJustSubmitted] = useState(false);

  // Search for artists
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

  // Select artist -> load discography
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

  // Filter discography
  const filteredDiscography = discography.filter(a => {
    if (hideCompilations && a.secondary_types.some(t =>
      ['Compilation', 'Live', 'Soundtrack', 'Remix', 'DJ-mix', 'Mixtape/Street', 'Demo', 'Interview', 'Spokenword'].includes(t)
    )) {
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

  // Start download (search mode)
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

  // Search for songs on YouTube
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

  // Add song to download list
  const addSongEntry = (result: YtSearchResult) => {
    let artist = '';
    let title = result.title;

    const separators = [' - ', ' — ', ' | '];
    for (const sep of separators) {
      if (result.title.includes(sep)) {
        const parts = result.title.split(sep);
        artist = parts[0].trim();
        title = parts.slice(1).join(sep).trim();
        break;
      }
    }

    title = title
      .replace(/\s*[\(\[].*?(official|video|audio|lyrics|hd|4k|visualizer|music video).*?[\)\]]\s*/gi, '')
      .replace(/\s*[\(\[].*?[\)\]]\s*$/, '')
      .trim();

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

  // Download selected songs
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

  // Start download (manual mode)
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

  // After all downloads complete
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

  // Manual entry helpers
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

  const typeCounts = discography.reduce((acc, a) => {
    if (hideCompilations && a.secondary_types.some(t =>
      ['Compilation', 'Live', 'Soundtrack', 'Remix', 'DJ-mix', 'Mixtape/Street', 'Demo', 'Interview', 'Spokenword'].includes(t)
    )) {
      return acc;
    }
    const key = ['Album', 'EP', 'Single'].includes(a.type) ? a.type.toLowerCase() : 'other';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const totalVisibleCount = Object.values(typeCounts).reduce((sum, n) => sum + n, 0);

  // Helper to create elements
  const h = React.createElement;

  return h('div', { className: 'pb-32' },
    // Header
    h('div', { className: 'mb-10' },
      h('h2', { className: 'text-sm font-bold tracking-[0.2em] text-white/40 uppercase mb-2' }, 'Plugin'),
      h('h1', { className: 'text-4xl font-bold tracking-tight' }, 'Downloader'),
      h('p', { className: 'text-sm text-white/30 mt-2' },
        'Download albums by artist, individual songs, or enter manually. Auto-tagged with MusicBrainz metadata.'
      )
    ),

    // Tabs
    h('div', { className: 'flex gap-1 bg-white/5 rounded-xl p-1 w-fit mb-8 border border-white/5' },
      h('button', {
        onClick: () => setActiveTab('search'),
        className: `px-5 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'search' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/70'}`
      }, 'Albums'),
      h('button', {
        onClick: () => setActiveTab('songs'),
        className: `px-5 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'songs' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/70'}`
      }, 'Songs'),
      h('button', {
        onClick: () => setActiveTab('manual'),
        className: `px-5 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'manual' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/70'}`
      }, 'Manual')
    ),

    h('div', { className: 'flex gap-8 flex-col lg:flex-row' },
      // Left column
      h('div', { className: 'flex-1 min-w-0' },
        activeTab === 'search' ? h('div', { className: 'space-y-6' },
          // Search bar
          h('div', { className: 'flex gap-3' },
            h('input', {
              type: 'text',
              placeholder: 'Artist name...',
              value: searchInput,
              onChange: (e: any) => setSearchInput(e.target.value),
              onKeyDown: (e: any) => e.key === 'Enter' && handleSearch(),
              className: 'flex-1 bg-white/5 border border-white/5 rounded-xl px-5 py-3 text-sm text-white placeholder:text-white/20 focus:outline-none focus:bg-white/10 focus:border-white/20 transition-colors'
            }),
            h('button', {
              onClick: handleSearch,
              disabled: isSearching || !searchInput.trim(),
              className: 'px-6 py-3 bg-white/10 border border-white/5 rounded-xl text-sm font-semibold hover:bg-white/20 disabled:opacity-30 disabled:hover:bg-white/10 transition-colors'
            }, isSearching ? h('span', { className: 'flex items-center gap-2' },
              h('span', { className: 'w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin' }),
              'Searching'
            ) : 'Search')
          ),

          // Artist disambiguation
          artistResults.length > 1 && !selectedArtist && h('div', { className: 'space-y-2' },
            h('h3', { className: 'text-xs font-bold tracking-[0.2em] text-white/40 uppercase' }, 'Pick the right artist'),
            h('div', { className: 'space-y-1' },
              ...artistResults.map(a =>
                h('button', {
                  key: a.id,
                  onClick: () => handleSelectArtist(a),
                  className: 'w-full flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/5 hover:bg-white/5 text-left transition-colors'
                },
                  h('span', { className: 'text-sm font-semibold' }, a.name),
                  a.disambiguation && h('span', { className: 'text-xs text-white/30' }, a.disambiguation)
                )
              )
            )
          ),

          // Loading discography
          isLoadingDiscography && h('div', { className: 'flex items-center gap-3 py-12 justify-center text-white/30 text-sm' },
            h('span', { className: 'w-4 h-4 border-2 border-white/20 border-t-white/60 rounded-full animate-spin' }),
            `Loading discography for ${selectedArtist?.name}...`
          ),

          // Discography loaded
          selectedArtist && !isLoadingDiscography && discography.length > 0 && h('div', { className: 'space-y-4' },
            // Artist header + back
            h('div', { className: 'flex items-center justify-between' },
              h('div', { className: 'flex items-center gap-3' },
                h('button', {
                  onClick: () => { setSelectedArtist(null); setDiscography([]); setSelected(new Set()); },
                  className: 'text-xs text-white/30 hover:text-white transition-colors'
                }, '← Back'),
                h('h3', { className: 'text-lg font-bold' }, selectedArtist.name),
                h('span', { className: 'text-xs text-white/30' }, `${discography.length} releases`)
              ),
              h('button', {
                onClick: selectAll,
                className: 'text-xs text-white/40 hover:text-white transition-colors font-medium'
              }, filteredDiscography.every(a => selected.has(a.id)) && filteredDiscography.length > 0 ? 'Deselect All' : 'Select All')
            ),

            // Filters
            h('div', { className: 'flex items-center gap-3 flex-wrap' },
              h('div', { className: 'flex gap-1 bg-white/5 rounded-lg p-1 border border-white/5' },
                ...(['all', 'album', 'ep', 'single', 'other'] as TypeFilter[]).map(f => {
                  const count = f === 'all' ? totalVisibleCount : (typeCounts[f] || 0);
                  return h('button', {
                    key: f,
                    onClick: () => setTypeFilter(f),
                    className: `px-3 py-1 rounded-md text-xs font-medium transition-colors ${typeFilter === f ? 'bg-white/10 text-white' : 'text-white/30 hover:text-white/60'}`
                  }, `${f === 'all' ? 'All' : f.toUpperCase()}${count > 0 ? ` (${count})` : ''}`);
                })
              ),
              h('label', { className: 'flex items-center gap-2 text-xs text-white/30 cursor-pointer select-none' },
                h('input', {
                  type: 'checkbox',
                  checked: hideCompilations,
                  onChange: (e: any) => setHideCompilations(e.target.checked),
                  className: 'accent-purple-500'
                }),
                'Hide compilations/live/soundtracks'
              ),
              h('div', { className: 'flex items-center gap-2 ml-auto' },
                h('span', { className: 'text-xs text-white/30 font-medium uppercase tracking-widest' }, 'Genre'),
                h('input', {
                  type: 'text',
                  placeholder: 'Rock',
                  value: genreOverride,
                  onChange: (e: any) => setGenreOverride(e.target.value),
                  className: 'bg-white/5 border border-white/5 rounded-lg px-3 py-1.5 text-xs text-white placeholder:text-white/20 focus:outline-none focus:border-white/20 transition-colors w-32'
                })
              )
            ),

            // Album grid
            h('div', { className: 'grid grid-cols-1 sm:grid-cols-2 gap-3' },
              ...filteredDiscography.map(album => {
                const isSelected = selected.has(album.id);
                return h('button', {
                  key: album.id,
                  onClick: () => toggleSelect(album.id),
                  className: `flex items-center gap-4 p-3 rounded-xl border text-left transition-all ${isSelected ? 'bg-white/10 border-purple-500/40 shadow-[0_0_20px_rgba(168,85,247,0.05)]' : 'bg-white/[0.02] border-white/5 hover:bg-white/5'}`
                },
                  h(LazyImage, { src: getCoverUrl(album.id), alt: '', className: 'w-14 h-14 rounded-lg bg-white/5 flex-shrink-0 overflow-hidden' }),
                  h('div', { className: 'min-w-0 flex-1' },
                    h('div', { className: 'text-sm font-semibold truncate' }, album.title),
                    h('div', { className: 'text-xs text-white/30 flex items-center gap-2 mt-0.5' },
                      album.year && h('span', null, album.year),
                      typeLabel(album.type) && h('span', { className: 'px-1.5 py-0.5 bg-white/5 rounded text-[10px] uppercase tracking-wider' }, typeLabel(album.type)),
                      album.secondary_types.length > 0 && h('span', { className: 'text-[10px] text-white/20' }, album.secondary_types.join(', '))
                    )
                  ),
                  h('div', { className: `w-5 h-5 rounded-md border-2 flex-shrink-0 flex items-center justify-center transition-colors ${isSelected ? 'bg-purple-500 border-purple-500' : 'border-white/20'}` },
                    isSelected && h('svg', { width: 12, height: 12, viewBox: '0 0 12 12', fill: 'none' },
                      h('path', { d: 'M2.5 6L5 8.5L9.5 3.5', stroke: 'white', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' })
                    )
                  )
                );
              })
            ),

            filteredDiscography.length === 0 && h('div', { className: 'text-center py-8 text-white/20 text-sm' }, 'No releases match the current filters'),

            // Download button
            selected.size > 0 && h('div', { className: 'pt-4' },
              h('button', {
                onClick: handleDownloadSelected,
                className: 'w-full py-4 bg-white text-black rounded-xl font-bold text-sm hover:bg-white/90 transition-all'
              }, `Download ${selected.size} Album${selected.size > 1 ? 's' : ''}`)
            )
          ),

          // Empty state
          !isSearching && !isLoadingDiscography && discography.length === 0 && !selectedArtist && artistResults.length === 0 &&
            h('div', { className: 'text-center py-16 text-white/20 text-sm' }, 'Search for an artist to browse their discography')
        )

        : activeTab === 'songs' ? h('div', { className: 'space-y-6' },
          // Song search bar
          h('div', { className: 'flex gap-3' },
            h('input', {
              type: 'text',
              placeholder: 'Search for a song...',
              value: songSearchInput,
              onChange: (e: any) => setSongSearchInput(e.target.value),
              onKeyDown: (e: any) => e.key === 'Enter' && handleSearchSongs(),
              className: 'flex-1 bg-white/5 border border-white/5 rounded-xl px-5 py-3 text-sm text-white placeholder:text-white/20 focus:outline-none focus:bg-white/10 focus:border-white/20 transition-colors'
            }),
            h('button', {
              onClick: handleSearchSongs,
              disabled: isSearchingSongs || !songSearchInput.trim(),
              className: 'px-6 py-3 bg-white/10 border border-white/5 rounded-xl text-sm font-semibold hover:bg-white/20 disabled:opacity-30 disabled:hover:bg-white/10 transition-colors'
            }, isSearchingSongs ? h('span', { className: 'flex items-center gap-2' },
              h('span', { className: 'w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin' }),
              'Searching'
            ) : 'Search')
          ),

          // Default genre
          h('div', { className: 'flex items-center gap-3' },
            h('span', { className: 'text-xs text-white/30 font-medium uppercase tracking-widest' }, 'Default Genre'),
            h('input', {
              type: 'text',
              placeholder: 'Rock',
              value: songGenre,
              onChange: (e: any) => setSongGenre(e.target.value),
              className: 'bg-white/5 border border-white/5 rounded-lg px-3 py-1.5 text-xs text-white placeholder:text-white/20 focus:outline-none focus:border-white/20 transition-colors w-32'
            })
          ),

          // Search results
          songResults.length > 0 && h('div', { className: 'space-y-3' },
            h('h3', { className: 'text-xs font-bold tracking-[0.2em] text-white/40 uppercase' }, 'Search Results'),
            h('div', { className: 'space-y-2 max-h-64 overflow-y-auto pr-2' },
              ...songResults.map(result => {
                const isAdded = songEntries.some(e => e.ytResult.id === result.id);
                return h('button', {
                  key: result.id,
                  onClick: () => !isAdded && addSongEntry(result),
                  disabled: isAdded,
                  className: `w-full flex items-center gap-4 p-3 rounded-xl border text-left transition-all ${isAdded ? 'bg-white/5 border-purple-500/30 opacity-50' : 'bg-white/[0.02] border-white/5 hover:bg-white/5'}`
                },
                  h('div', { className: 'w-10 h-10 rounded-lg bg-white/5 flex-shrink-0 overflow-hidden' },
                    h('img', { src: `https://i.ytimg.com/vi/${result.id}/default.jpg`, alt: '', className: 'w-full h-full object-cover', loading: 'lazy' })
                  ),
                  h('div', { className: 'min-w-0 flex-1' },
                    h('div', { className: 'text-sm font-medium truncate' }, result.title),
                    h('div', { className: 'text-xs text-white/30 flex items-center gap-2' },
                      h('span', null, result.channel),
                      h('span', { className: 'text-white/20' }, '•'),
                      h('span', null, result.duration)
                    )
                  ),
                  h('div', { className: `px-3 py-1 rounded-lg text-xs font-medium ${isAdded ? 'bg-purple-500/20 text-purple-300' : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white'}` },
                    isAdded ? 'Added' : '+ Add'
                  )
                );
              })
            )
          ),

          // Selected songs
          songEntries.length > 0 && h('div', { className: 'space-y-3' },
            h('div', { className: 'flex items-center justify-between' },
              h('h3', { className: 'text-xs font-bold tracking-[0.2em] text-white/40 uppercase' }, `Download List (${songEntries.length})`),
              h('button', {
                onClick: () => setSongEntries([]),
                className: 'text-xs text-white/30 hover:text-red-400 transition-colors'
              }, 'Clear All')
            ),
            h('div', { className: 'space-y-3' },
              ...songEntries.map(entry =>
                h('div', { key: entry.ytResult.id, className: 'bg-white/[0.03] border border-white/5 rounded-2xl p-4 space-y-3' },
                  h('div', { className: 'flex items-center justify-between gap-3' },
                    h('div', { className: 'flex items-center gap-3 min-w-0 flex-1' },
                      h('div', { className: 'w-10 h-10 rounded-lg bg-white/5 flex-shrink-0 overflow-hidden' },
                        h('img', { src: `https://i.ytimg.com/vi/${entry.ytResult.id}/default.jpg`, alt: '', className: 'w-full h-full object-cover' })
                      ),
                      h('div', { className: 'min-w-0' },
                        h('div', { className: 'text-xs text-white/30 truncate' }, entry.ytResult.title),
                        h('div', { className: 'text-[10px] text-white/20' }, entry.ytResult.duration)
                      )
                    ),
                    h('button', {
                      onClick: () => removeSongEntry(entry.ytResult.id),
                      className: 'text-xs text-white/20 hover:text-red-400 transition-colors'
                    }, 'Remove')
                  ),
                  h('div', { className: 'grid grid-cols-2 gap-2' },
                    h('input', { type: 'text', placeholder: 'Title', value: entry.title, onChange: (e: any) => updateSongEntry(entry.ytResult.id, 'title', e.target.value), className: 'bg-white/5 border border-white/5 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-white/20 transition-colors' }),
                    h('input', { type: 'text', placeholder: 'Artist', value: entry.artist, onChange: (e: any) => updateSongEntry(entry.ytResult.id, 'artist', e.target.value), className: 'bg-white/5 border border-white/5 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-white/20 transition-colors' }),
                    h('input', { type: 'text', placeholder: 'Album (optional)', value: entry.album, onChange: (e: any) => updateSongEntry(entry.ytResult.id, 'album', e.target.value), className: 'bg-white/5 border border-white/5 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-white/20 transition-colors' }),
                    h('div', { className: 'flex gap-2' },
                      h('input', { type: 'text', placeholder: 'Year', value: entry.year, onChange: (e: any) => updateSongEntry(entry.ytResult.id, 'year', e.target.value), className: 'flex-1 bg-white/5 border border-white/5 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-white/20 transition-colors' }),
                      h('input', { type: 'text', placeholder: 'Genre', value: entry.genre, onChange: (e: any) => updateSongEntry(entry.ytResult.id, 'genre', e.target.value), className: 'flex-1 bg-white/5 border border-white/5 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-white/20 transition-colors' })
                    )
                  )
                )
              )
            ),
            h('div', { className: 'pt-2' },
              h('button', {
                onClick: handleDownloadSongs,
                className: 'w-full py-4 bg-white text-black rounded-xl font-bold text-sm hover:bg-white/90 transition-all'
              }, `Download ${songEntries.length} Song${songEntries.length > 1 ? 's' : ''}`)
            )
          ),

          songEntries.length > 0 && h('div', { className: 'text-xs text-white/20 text-center' },
            "Tip: Songs without an album will be saved to a \"Singles\" folder for the artist."
          ),

          !isSearchingSongs && songResults.length === 0 && songEntries.length === 0 &&
            h('div', { className: 'text-center py-16 text-white/20 text-sm space-y-2' },
              h('div', null, 'Search for any song on YouTube to download it'),
              h('div', { className: 'text-xs text-white/10' }, "Results are auto-parsed for artist/title, but you can edit before downloading")
            )
        )

        : h('div', { className: 'space-y-4' },
          // Manual entries
          ...manualEntries.map((entry, i) =>
            h('div', { key: i, className: 'bg-white/[0.03] border border-white/5 rounded-2xl p-5 space-y-3' },
              h('div', { className: 'flex items-center justify-between mb-1' },
                h('span', { className: 'text-xs text-white/20 font-mono' }, `#${i + 1}`),
                manualEntries.length > 1 && h('button', {
                  onClick: () => removeManualEntry(i),
                  className: 'text-xs text-white/20 hover:text-red-400 transition-colors'
                }, 'Remove')
              ),
              h('div', { className: 'grid grid-cols-2 gap-3' },
                h('input', { type: 'text', placeholder: 'Artist', value: entry.artist, onChange: (e: any) => updateManualEntry(i, 'artist', e.target.value), className: 'bg-white/5 border border-white/5 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-white/20 transition-colors' }),
                h('input', { type: 'text', placeholder: 'Album', value: entry.album, onChange: (e: any) => updateManualEntry(i, 'album', e.target.value), className: 'bg-white/5 border border-white/5 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-white/20 transition-colors' }),
                h('input', { type: 'text', placeholder: 'Year', value: entry.year, onChange: (e: any) => updateManualEntry(i, 'year', e.target.value), className: 'bg-white/5 border border-white/5 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-white/20 transition-colors' }),
                h('input', { type: 'text', placeholder: 'Genre (default: Rock)', value: entry.genre, onChange: (e: any) => updateManualEntry(i, 'genre', e.target.value), className: 'bg-white/5 border border-white/5 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-white/20 transition-colors' })
              )
            )
          ),
          h('button', {
            onClick: addManualEntry,
            className: 'w-full py-3 border border-dashed border-white/10 rounded-xl text-xs text-white/30 hover:text-white/60 hover:border-white/20 transition-colors font-medium uppercase tracking-widest'
          }, '+ Add Another Album'),
          h('div', { className: 'pt-2' },
            h('button', {
              onClick: handleDownloadManual,
              disabled: !manualEntries.some(e => e.artist.trim() && e.album.trim()),
              className: 'w-full py-4 bg-white text-black rounded-xl font-bold text-sm hover:bg-white/90 disabled:opacity-30 transition-all'
            }, `Download ${manualEntries.filter(e => e.artist.trim() && e.album.trim()).length} Album${manualEntries.filter(e => e.artist.trim() && e.album.trim()).length !== 1 ? 's' : ''}`)
          )
        )
      ),

      // Right column: Download Queue
      h('div', { className: 'lg:w-80 flex-shrink-0' },
        h(DownloadQueue, { onToast, onAllComplete: handleAllComplete })
      )
    )
  );
};

// ── Plugin Registration ────────────────────────────────────────────────────

window.GuteMusik.registerPlugin({
  id: 'downloader',
  label: 'Downloader',
  icon: 'download',
  view: DownloaderView,
});
