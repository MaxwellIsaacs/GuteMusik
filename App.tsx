import React, { useState, useEffect, useCallback, useRef } from 'react';
import { usePlatform } from './hooks/usePlatform';
import { ArrowLeft, ArrowRight, X, ArrowRight as ArrowRightIcon } from '@phosphor-icons/react';
import { ChromeIcon } from './components/ChromeIcon';
import { Sidebar } from './components/Sidebar';
import { PlayerCapsule } from './components/PlayerCapsule';
import { FullScreenPlayer } from './components/FullScreenPlayer';
import { Toast } from './components/ui/Toast';
import { ContextMenu } from './components/ui/ContextMenu';
import { LibraryView } from './views/LibraryView';
import { PlaylistView } from './views/PlaylistView';
import { QueueView } from './views/QueueView';
import { ArtistView } from './views/ArtistView';
import { AlbumView } from './views/AlbumView';
import { SearchView } from './views/SearchView';
import { ServerConfig } from './views/ServerConfig';
import { ViewState, ContextMenuState } from './types';
import { useAudio } from './context/AudioContext';
import { useServer } from './context/ServerContext';

const App = () => {
  const { isLinux } = usePlatform();
  const { state: audioState, playTrack, togglePlay } = useAudio();
  const { searchQuery, searchResults, isSearching, search, clearSearch, addToQueue, toggleStar } = useServer();
  const isPlaying = audioState.isPlaying;

  // Apply Linux performance class to body for global CSS overrides
  useEffect(() => {
    if (isLinux) {
      document.body.classList.add('linux');
    }
    return () => { document.body.classList.remove('linux'); };
  }, [isLinux]);

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
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | undefined>(undefined);
  const [selectedArtistId, setSelectedArtistId] = useState<string | undefined>(undefined);
  const [selectedAlbumId, setSelectedAlbumId] = useState<string | undefined>(undefined);

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
  const handleContextAction = useCallback((action: string, item: any) => {
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
      default:
        showToast(`${action}: ${item.title || 'Item'}`);
    }
  }, [playTrack, addToQueue, toggleStar, showToast]);

  // Keyboard Shortcuts (stable handler using refs)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      }
      if (e.key === 'Escape' && isPlayerExpandedRef.current) {
        setIsPlayerExpanded(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlay]);

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
            onPlayAlbum={(id) => { showToast(`Playing Album ${id}`); }}
            onNavigateToAlbum={(id) => { setSelectedAlbumId(id); navigate('Album'); }}
            onNavigateToArtist={(id) => { setSelectedArtistId(id); navigate('Artist'); }}
            onContextMenu={handleContextMenu}
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
        return <ServerConfig onClose={() => navigate('Library')} onConnect={() => { showToast("Connected"); navigate('Library'); }} />;
      default:
        return <LibraryView onPlayAlbum={() => {}} onNavigateToAlbum={() => {}} onNavigateToArtist={() => {}} onContextMenu={handleContextMenu} />;
    }
  };

  return (
    <div className="relative w-full h-screen bg-[#050505] text-white overflow-hidden font-sans selection:bg-white/20" onClick={() => { if (contextMenu) setContextMenu(null); }}>
      
      {/* Overlays */}
      <Toast message={toastMessage} />
      <ContextMenu menu={contextMenu} onClose={() => setContextMenu(null)} onAction={handleContextAction} />
      {showWizard && (
        <div className={`absolute inset-0 z-[100] flex items-center justify-center ${isLinux ? 'bg-black/90' : 'bg-black/80 backdrop-blur-xl'} p-8`} onClick={(e) => e.stopPropagation()}>
          <div className="w-full max-w-2xl bg-[#0a0a0a] border border-white/10 rounded-3xl p-12 relative shadow-2xl overflow-hidden">
            <button onClick={() => setShowWizard(false)} className="absolute top-8 right-8 text-white/40 hover:text-white transition-colors"><X size={24} weight="light" /></button>
            <div className="animate-in slide-in-from-right-8 fade-in duration-500">
                <h2 className="text-sm font-bold tracking-[0.2em] text-white/50 uppercase mb-4">Step 01</h2>
                <h1 className="text-5xl font-medium text-white mb-8 tracking-tighter">Name your creation.</h1>
                <input autoFocus type="text" placeholder="My Playlist..." className="w-full bg-transparent border-b border-white/20 text-4xl text-white placeholder:text-white/20 pb-4 focus:outline-none focus:border-white transition-colors"/>
                <div className="mt-12 flex justify-end">
                <button onClick={() => { setShowWizard(false); showToast("Playlist Created"); }} className="px-8 py-4 bg-white text-black rounded-full font-bold flex items-center gap-2 hover:scale-105 transition-transform">Finish <ArrowRightIcon size={18} weight="bold" /></button>
                </div>
            </div>
          </div>
        </div>
      )}
      
      {isPlayerExpanded && (
        <FullScreenPlayer
            onCollapse={() => setIsPlayerExpanded(false)}
            onToast={showToast}
            onNavigateToArtist={(id) => { setSelectedArtistId(id); navigate('Artist'); setIsPlayerExpanded(false); }}
        />
      )}

      {/* Modern Ambient Background 2026 Vibe */}
      {!isLinux && (
        <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
           {/* Noise Texture Overlay */}
           <div className="absolute inset-0 bg-noise opacity-[0.03] z-[5] mix-blend-overlay"></div>

           {/* Deep Atmospheric Gradients — reduced blur for performance */}
           <div className="absolute top-[-20%] left-[-20%] w-[80vw] h-[80vw] bg-slate-900/40 rounded-full blur-[80px] mix-blend-screen animate-[pulse_15s_infinite] will-change-transform"></div>
           <div className="absolute bottom-[-10%] right-[-10%] w-[60vw] h-[60vw] bg-purple-950/20 rounded-full blur-[80px] mix-blend-screen animate-[pulse_20s_infinite_reverse] will-change-transform"></div>
           <div className="absolute top-[20%] right-[10%] w-[40vw] h-[40vw] bg-indigo-950/20 rounded-full blur-[60px] mix-blend-screen animate-[pulse_12s_infinite] will-change-transform"></div>
        </div>
      )}

      <div className="relative z-10 flex h-full p-4 gap-6">
        <Sidebar activeTab={activeTab} onNavigate={(view) => { if (view === 'Artist') setSelectedArtistId(undefined); navigate(view); }} onNewPlaylist={() => setShowWizard(true)} />

        <main className={`flex-1 h-full overflow-hidden relative rounded-3xl border border-white/5 bg-black/40 flex flex-col`}>
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
            {renderView()}
          </div>
        </main>
      </div>

      {/* Player Capsule */}
      <PlayerCapsule
        onToast={showToast}
        onExpand={() => setIsPlayerExpanded(true)}
        onNavigateToArtist={(id) => { setSelectedArtistId(id); navigate('Artist'); }}
        className={`${isLinux ? '' : 'transition-[transform,opacity] duration-300'} ${isPlayerExpanded ? 'translate-y-32 opacity-0' : 'translate-y-0 opacity-100'}`}
      />
    </div>
  );
};

export default App;