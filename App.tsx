import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { ArrowLeft, ArrowRight, X, ArrowRight as ArrowRightIcon } from '@phosphor-icons/react';
import { ChromeIcon } from './components/ChromeIcon';
import { Sidebar } from './components/Sidebar';
import { PlayerCapsule } from './components/PlayerCapsule';
import { FullScreenPlayer } from './components/FullScreenPlayer';
import { Toast } from './components/ui/Toast';
import { ContextMenu } from './components/ui/ContextMenu';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { LibraryView } from './views/LibraryView';
import { PlaylistView } from './views/PlaylistView';
import { QueueView } from './views/QueueView';
import { ArtistView } from './views/ArtistView';
import { AlbumView } from './views/AlbumView';
import { SearchView } from './views/SearchView';
import { ServerConfig } from './views/ServerConfig';
import { AddMusicWizard } from './views/AddMusicWizard';
import { ViewState, ContextMenuState, Playlist, PluginDefinition } from './types';
import { useAudio } from './context/AudioContext';
import { useServer } from './context/ServerContext';
import { builtinPlugins } from './plugins';
import { initPluginAPI, loadInstalledPlugins, importPlugin, importPluginFolder, removePlugin, getDynamicPlugins, getInstalledPlugins } from './services/pluginLoader';

const DISABLED_PLUGINS_KEY = 'gutemusik:disabled-plugins';

function loadStringArray(key: string): string[] {
  try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; }
}

// Initialize plugin API once at module load
initPluginAPI();

const NewPlaylistWizard: React.FC<{ onClose: () => void; onCreate: (name: string) => void }> = ({ onClose, onCreate }) => {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [step, setStep] = useState(1);

  return (
    <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-xl p-8" onClick={(e) => e.stopPropagation()}>
      <div className="w-full max-w-2xl bg-[#0a0a0a] border border-white/10 rounded-3xl p-12 relative shadow-2xl overflow-hidden">
        <button onClick={onClose} className="absolute top-8 right-8 text-white/40 hover:text-white transition-colors"><X size={24} weight="light" /></button>
        {step === 1 ? (
          <div className="animate-in slide-in-from-right-8 fade-in duration-500">
            <h2 className="text-sm font-bold tracking-[0.2em] text-white/50 uppercase mb-4">Step 01</h2>
            <h1 className="text-5xl font-medium text-white mb-8 tracking-tighter">Name your creation.</h1>
            <input
              autoFocus
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) setStep(2); }}
              placeholder="My Playlist..."
              className="w-full bg-transparent border-b border-white/20 text-4xl text-white placeholder:text-white/20 pb-4 focus:outline-none focus:border-white transition-colors"
            />
            <div className="mt-12 flex justify-end">
              <button
                onClick={() => { if (name.trim()) setStep(2); }}
                disabled={!name.trim()}
                className="px-8 py-4 bg-white text-black rounded-full font-bold flex items-center gap-2 hover:scale-105 transition-transform disabled:opacity-40 disabled:hover:scale-100"
              >
                Next <ArrowRightIcon size={18} weight="bold" />
              </button>
            </div>
          </div>
        ) : (
          <div className="animate-in slide-in-from-right-8 fade-in duration-500">
            <h2 className="text-sm font-bold tracking-[0.2em] text-white/50 uppercase mb-4">Step 02</h2>
            <h1 className="text-5xl font-medium text-white mb-8 tracking-tighter">Describe it.</h1>
            <textarea
              autoFocus
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="Optional description..."
              rows={3}
              className="w-full bg-transparent border-b border-white/20 text-2xl text-white placeholder:text-white/20 pb-4 focus:outline-none focus:border-white transition-colors resize-none"
            />
            <div className="mt-12 flex justify-between">
              <button onClick={() => setStep(1)} className="px-6 py-4 text-white/40 hover:text-white font-bold transition-colors">Back</button>
              <button
                onClick={() => onCreate(name.trim())}
                className="px-8 py-4 bg-white text-black rounded-full font-bold flex items-center gap-2 hover:scale-105 transition-transform"
              >
                Finish <ArrowRightIcon size={18} weight="bold" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const App = () => {
  const { state: audioState, playTrack, togglePlay, next: nextTrack, previous: previousTrack, toggleMute, setVolume } = useAudio();
  const serverContext = useServer();
  const { searchQuery, searchResults, isSearching, search, clearSearch, addToQueue, toggleStar, albums, playlists, createPlaylist, addToPlaylist } = serverContext;
  const isPlaying = audioState.isPlaying;

  // Plugin management state
  const [disabledPlugins, setDisabledPlugins] = useState<string[]>(() => loadStringArray(DISABLED_PLUGINS_KEY));
  const [dynamicPlugins, setDynamicPlugins] = useState<PluginDefinition[]>([]);

  // Load dynamic plugins on mount
  useEffect(() => {
    const loaded = loadInstalledPlugins();
    setDynamicPlugins(loaded);
  }, []);

  // Merge built-in and dynamic plugins (dynamic/imported plugins override built-in with same ID)
  const plugins = useMemo(() => {
    const byId = new Map<string, PluginDefinition>();
    for (const p of builtinPlugins) byId.set(p.id, p);
    for (const p of dynamicPlugins) byId.set(p.id, p); // Override built-in
    return Array.from(byId.values());
  }, [dynamicPlugins]);
  const enabledPlugins = useMemo(() => plugins.filter(p => !disabledPlugins.includes(p.id)), [plugins, disabledPlugins]);

  // Search state
  const [searchInput, setSearchInput] = useState('');
  const searchTimeoutRef = useRef<number | null>(null);

  // Debounced search
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (searchInput.trim()) {
      searchTimeoutRef.current = window.setTimeout(() => {
        search(searchInput);
      }, 300);
    } else {
      clearSearch();
    }

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchInput, search, clearSearch]);

  // Check if search is active
  const isSearchActive = searchInput.trim().length > 0;

  // State
  const [activeTab, setActiveTab] = useState<ViewState>('Library');
  const [navHistory, setNavHistory] = useState<ViewState[]>(['Library']);
  const [navIndex, setNavIndex] = useState(0);
  const [isPlayerExpanded, setIsPlayerExpanded] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [showWizard, setShowWizard] = useState(false);
  const [addMusicPlaylist, setAddMusicPlaylist] = useState<Playlist | null>(null);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | undefined>(undefined);
  const [selectedArtistId, setSelectedArtistId] = useState<string | undefined>(undefined);
  const [selectedAlbumId, setSelectedAlbumId] = useState<string | undefined>(undefined);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Track which album to scroll to when returning to Library
  const [returnToAlbumId, setReturnToAlbumId] = useState<string | undefined>(undefined);

  // Ref for the scrollable view container
  const viewContainerRef = useRef<HTMLDivElement>(null);

  // Ref for keyboard handler to avoid stale closures
  const isPlayerExpandedRef = useRef(isPlayerExpanded);

  useEffect(() => {
    isPlayerExpandedRef.current = isPlayerExpanded;
  }, [isPlayerExpanded]);

  // Actions (memoized with useCallback)
  const showToast = useCallback((message: string) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), 3000);
  }, []);

  // Plugin action handlers (need showToast above)
  const handleTogglePlugin = useCallback((id: string) => {
    setDisabledPlugins(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
      localStorage.setItem(DISABLED_PLUGINS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const handleDeletePlugin = useCallback((id: string) => {
    // Check if it's a dynamic plugin (can be removed) or built-in (just disable)
    const isBuiltin = builtinPlugins.some(p => p.id === id);
    if (isBuiltin) {
      // Can't delete built-in plugins, just disable them
      setDisabledPlugins(prev => {
        const next = prev.includes(id) ? prev : [...prev, id];
        localStorage.setItem(DISABLED_PLUGINS_KEY, JSON.stringify(next));
        return next;
      });
      showToast('Built-in plugin disabled');
    } else {
      // Remove dynamic plugin
      removePlugin(id);
      setDynamicPlugins(getDynamicPlugins());
      showToast('Plugin removed');
    }
  }, [showToast]);

  const handleImportPlugin = useCallback(async (file: File) => {
    const result = await importPlugin(file);
    if (result.success && result.plugin) {
      setDynamicPlugins(getDynamicPlugins());
      showToast(`Installed: ${result.plugin.name}`);
    } else {
      showToast(result.error || 'Failed to import plugin');
    }
  }, [showToast]);

  const handleImportPluginFolder = useCallback(async (files: FileList) => {
    const result = await importPluginFolder(files);
    if (result.success && result.plugin) {
      setDynamicPlugins(getDynamicPlugins());
      showToast(`Installed: ${result.plugin.name}`);
    } else {
      showToast(result.error || 'Failed to import plugin folder');
    }
  }, [showToast]);

  const handleContextMenu = useCallback((e: React.MouseEvent, item: any, type: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, item, type });
  }, []);

  const navigate = useCallback((view: ViewState) => {
    if (view === 'Playlists') setSelectedPlaylistId(undefined);

    // Scroll to top when navigating forward
    viewContainerRef.current?.scrollTo({ top: 0 });

    setActiveTab(currentTab => {
      if (currentTab === view && view !== 'Playlists' && view !== 'Artist' && view !== 'Album') {
        return currentTab;
      }
      setNavHistory(prev => {
        const newHistory = prev.slice(0, navIndex + 1);
        newHistory.push(view);
        setNavIndex(newHistory.length - 1);
        return newHistory;
      });
      return view;
    });
  }, [navIndex]);

  const goBack = useCallback(() => {
    if (navIndex > 0) {
      const destination = navHistory[navIndex - 1];
      const current = navHistory[navIndex];

      // When going back from Album to Library, tell Library which album to scroll to
      if (current === 'Album' && destination === 'Library') {
        setReturnToAlbumId(selectedAlbumId);
      } else {
        // Scroll to top for all other back navigations
        viewContainerRef.current?.scrollTo({ top: 0 });
      }

      setNavIndex(navIndex - 1);
      setActiveTab(destination);
    }
  }, [navIndex, navHistory, selectedAlbumId]);

  const goForward = useCallback(() => {
    if (navIndex < navHistory.length - 1) {
      viewContainerRef.current?.scrollTo({ top: 0 });
      setNavIndex(navIndex + 1);
      setActiveTab(navHistory[navIndex + 1]);
    }
  }, [navIndex, navHistory]);

  // Context menu action handler
  const handleContextAction = useCallback(async (action: string, item: any, extra?: any) => {
    switch (action) {
      case 'Play Now':
        if (item.duration) { // It's a track
          playTrack(item);
        }
        showToast(`Playing: ${item.title || 'Item'}`);
        break;
      case 'Add to Queue':
        if (item.duration) { // It's a track
          addToQueue(item);
          showToast(`Added to queue: ${item.title}`);
        } else {
          showToast(`Cannot add ${item.title || 'item'} to queue`);
        }
        break;
      case 'Love Track':
        if (item.id) {
          const isTrack = !!item.duration;
          toggleStar(item.id, isTrack ? 'song' : 'album', item.liked || false);
          showToast(item.liked ? `Removed from favorites` : `Added to favorites`);
        }
        break;
      case 'Add to Playlist':
        if (extra?.playlistId && item.id) {
          try {
            await addToPlaylist(extra.playlistId, [item.id]);
            showToast(`Added to ${extra.playlistName || 'playlist'}`);
          } catch {
            showToast('Failed to add to playlist');
          }
        }
        break;
      case 'Download':
        navigate('Plugin:downloader' as ViewState);
        showToast(`Opening downloader...`);
        break;
      default:
        showToast(`${action}: ${item.title || 'Item'}`);
    }
  }, [playTrack, addToQueue, addToPlaylist, toggleStar, showToast, navigate]);

  // Keyboard Shortcuts (stable handler using refs)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;
      switch (e.code) {
        case 'Space':
          e.preventDefault();
          togglePlay();
          break;
        case 'ArrowRight':
          e.preventDefault();
          nextTrack();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          previousTrack();
          break;
        case 'BracketRight':
          e.preventDefault();
          setVolume(Math.min(1, audioState.volume + 0.05));
          break;
        case 'BracketLeft':
          e.preventDefault();
          setVolume(Math.max(0, audioState.volume - 0.05));
          break;
      }
      if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        toggleMute();
      }
      if (e.key === 'Escape' && isPlayerExpandedRef.current) {
        setIsPlayerExpanded(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlay, nextTrack, previousTrack, toggleMute, setVolume, audioState.volume]);

  // Render View Switcher
  const renderView = () => {
    // Show search results when search is active
    if (isSearchActive) {
      return <SearchView
          onPlayTrack={(track, queue) => { playTrack(track, queue); }}
          onNavigateToAlbum={(id) => { setSearchInput(''); setSelectedAlbumId(id); navigate('Album'); }}
          onNavigateToArtist={(id) => { setSearchInput(''); setSelectedArtistId(id); navigate('Artist'); }}
          onContextMenu={handleContextMenu}
      />;
    }

    switch (activeTab) {
      case 'Library':
        return <LibraryView
            onPlayAlbum={(id) => { const album = albums.find(a => a.id === id); showToast(`Playing: ${album?.title || 'Album'}`); }}
            onNavigateToAlbum={(id) => { setSelectedAlbumId(id); navigate('Album'); }}
            onNavigateToArtist={(id) => { setSelectedArtistId(id); navigate('Artist'); }}
            onContextMenu={handleContextMenu}
            onPlayTrack={(track, queue) => { playTrack(track, queue); }}
            returnToAlbumId={returnToAlbumId}
            onReturnHandled={() => setReturnToAlbumId(undefined)}
            scrollContainer={viewContainerRef}
        />;
      case 'Playlists':
        return <PlaylistView
            playlistId={selectedPlaylistId}
            onSelectPlaylist={(id) => setSelectedPlaylistId(id)}
            onPlayTrack={(track, queue) => { playTrack(track, queue); }}
            onNavigateToArtist={(id) => { setSelectedArtistId(id); navigate('Artist'); }}
            onContextMenu={handleContextMenu}
            onToast={showToast}
            onOpenAddMusic={(pl) => setAddMusicPlaylist(pl)}
        />;
      case 'Queue':
        return <QueueView
            onToast={showToast}
            onContextMenu={handleContextMenu}
            onNavigateToArtist={(id) => { setSelectedArtistId(id); navigate('Artist'); }}
        />;
      case 'Artist':
        return <ArtistView
            artistId={selectedArtistId}
            onSelectArtist={(id) => setSelectedArtistId(id)}
            onSelectAlbum={(id) => { setSelectedAlbumId(id); navigate('Album'); }}
            onPlayTrack={(track, queue) => { playTrack(track, queue); }}
            onContextMenu={handleContextMenu}
            onToast={showToast}
        />;
      case 'Album':
        return <AlbumView
            albumId={selectedAlbumId}
            onPlayTrack={(track, queue) => { playTrack(track, queue); }}
            onNavigateToArtist={(id) => { setSelectedArtistId(id); navigate('Artist'); }}
            onContextMenu={handleContextMenu}
            onToast={showToast}
        />;
      case 'Settings':
        return <ServerConfig
            onClose={() => navigate('Library')}
            onConnect={() => { showToast("Connected"); navigate('Library'); }}
            plugins={plugins}
            disabledPlugins={disabledPlugins}
            onTogglePlugin={handleTogglePlugin}
            onDeletePlugin={handleDeletePlugin}
            onImportPlugin={handleImportPlugin}
            onImportPluginFolder={handleImportPluginFolder}
        />;
      default: {
        // Check for plugin views (Plugin:my-plugin-id)
        if (activeTab.startsWith('Plugin:')) {
          const pluginId = activeTab.slice('Plugin:'.length);
          const plugin = plugins.find(p => p.id === pluginId);
          if (plugin) {
            const PluginView = plugin.view;
            return <PluginView
              onPlayTrack={(track, queue) => { playTrack(track, queue); }}
              onNavigateToAlbum={(id) => { setSelectedAlbumId(id); navigate('Album'); }}
              onNavigateToArtist={(id) => { setSelectedArtistId(id); navigate('Artist'); }}
              onContextMenu={handleContextMenu}
              onToast={showToast}
              serverState={serverContext.state}
              refreshAlbums={serverContext.refreshAlbums}
              refreshArtists={serverContext.refreshArtists}
            />;
          }
        }
        return <LibraryView onPlayAlbum={() => {}} onNavigateToAlbum={() => {}} onNavigateToArtist={() => {}} onContextMenu={handleContextMenu} />;
      }
    }
  };

  return (
    <div className="relative w-full h-screen bg-[#050505] text-white overflow-hidden font-sans selection:bg-white/20" onClick={() => { if (contextMenu) setContextMenu(null); }}>

      {/* Overlays */}
      <Toast message={toastMessage} />
      <ContextMenu menu={contextMenu} playlists={playlists} onClose={() => setContextMenu(null)} onAction={handleContextAction} />
      {showWizard && <NewPlaylistWizard
        onClose={() => setShowWizard(false)}
        onCreate={async (name: string) => {
          const pl = await createPlaylist(name);
          if (pl) {
            showToast(`Created playlist: ${pl.title}`);
            setSelectedPlaylistId(pl.id);
            navigate('Playlists');
          } else {
            showToast('Failed to create playlist');
          }
          setShowWizard(false);
        }}
      />}

      {addMusicPlaylist && (
        <AddMusicWizard
          playlist={addMusicPlaylist}
          onClose={() => setAddMusicPlaylist(null)}
          onToast={showToast}
        />
      )}

      {isPlayerExpanded && (
        <FullScreenPlayer
            onCollapse={() => setIsPlayerExpanded(false)}
            onToast={showToast}
            onNavigateToArtist={(id) => { setSelectedArtistId(id); navigate('Artist'); setIsPlayerExpanded(false); }}
        />
      )}

      {/* Top drag region — spans the full window width for titlebar dragging */}
      <div data-tauri-drag-region className="absolute top-0 left-0 right-0 h-10 z-[5]" />

      <div className="relative z-10 flex h-full p-4 gap-6">
        <Sidebar activeTab={activeTab} onNavigate={(view) => { if (view === 'Artist') setSelectedArtistId(undefined); navigate(view); }} onNewPlaylist={() => setShowWizard(true)} plugins={enabledPlugins} collapsed={sidebarCollapsed} onToggleCollapse={() => setSidebarCollapsed(c => !c)} />

        <main className={`flex-1 h-full overflow-hidden relative rounded-3xl border border-white/5 bg-black/40 flex flex-col`}>
          {/* Subtle noise texture — scoped to main content only */}
          <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none rounded-3xl">
             <div className="absolute inset-0 bg-noise opacity-[0.03] mix-blend-overlay"></div>
          </div>
           {/* Header */}
           <div data-tauri-drag-region className="sticky top-0 z-40 px-8 py-6 flex justify-between items-center bg-gradient-to-b from-black/20 to-transparent">
             <div className="flex gap-4 items-center">
                <div className="flex gap-1 bg-black/20 rounded-full p-1 border border-white/5">
                    <button onClick={goBack} disabled={navIndex === 0} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"><ArrowLeft size={16} weight="bold"/></button>
                    <button onClick={goForward} disabled={navIndex === navHistory.length - 1} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"><ArrowRight size={16} weight="bold"/></button>
                </div>
             </div>

             <div className="relative group z-50">
                <ChromeIcon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 opacity-40 group-focus-within:opacity-100 transition-opacity" />
                <input
                  type="text"
                  placeholder="Search..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="bg-white/5 border border-white/5 rounded-full py-2 pl-10 pr-10 text-sm w-64 text-white placeholder:text-white/30 focus:outline-none focus:bg-white/10 focus:border-white/20 transition-colors"
                />
                {searchInput && (
                  <button
                    onClick={() => setSearchInput('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition-colors"
                  >
                    <X size={14} weight="bold" />
                  </button>
                )}
             </div>
          </div>

          {/* View Container */}
          <div ref={viewContainerRef} className="flex-1 overflow-y-auto no-scrollbar px-10 pt-4">
            <ErrorBoundary>
              {renderView()}
            </ErrorBoundary>
          </div>
        </main>
      </div>

      {/* Player Capsule */}
      <PlayerCapsule
        onToast={showToast}
        onExpand={() => setIsPlayerExpanded(true)}
        onNavigateToArtist={(id) => { setSelectedArtistId(id); navigate('Artist'); }}
        onNavigateToAlbum={(id) => { setSelectedAlbumId(id); navigate('Album'); }}
        sidebarWidth={sidebarCollapsed ? 68 : 256}
        className={`transition-[transform,opacity] duration-300 ${isPlayerExpanded ? 'translate-y-32 opacity-0' : 'translate-y-0 opacity-100'}`}
      />
    </div>
  );
};

export default App;
