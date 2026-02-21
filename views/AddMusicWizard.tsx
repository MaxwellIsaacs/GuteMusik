import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, MagnifyingGlass, CircleNotch, Check, Plus, MusicNotesPlus, Disc, Waveform } from '@phosphor-icons/react';
import { PLACEHOLDER_COVER } from '../utils/placeholders';
import { useServer } from '../context/ServerContext';
import { Track, Album, Playlist } from '../types';

interface AddMusicWizardProps {
  playlist: Playlist;
  onClose: () => void;
  onToast: (msg: string) => void;
}

type BrowseMode = 'search' | 'albums' | 'favorites';

export const AddMusicWizard: React.FC<AddMusicWizardProps> = ({ playlist, onClose, onToast }) => {
  const { api, albums, starredTracks, addToPlaylist } = useServer();

  const [browseMode, setBrowseMode] = useState<BrowseMode>('search');
  const [searchInput, setSearchInput] = useState('');
  const [searchResults, setSearchResults] = useState<Track[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [albumTracks, setAlbumTracks] = useState<Track[]>([]);
  const [selectedAlbum, setSelectedAlbum] = useState<Album | null>(null);
  const [isLoadingAlbum, setIsLoadingAlbum] = useState(false);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [addingId, setAddingId] = useState<string | null>(null);
  const searchTimeoutRef = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (browseMode === 'search' && inputRef.current) {
      inputRef.current.focus();
    }
  }, [browseMode]);

  // Debounced search
  useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (!searchInput.trim()) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    searchTimeoutRef.current = window.setTimeout(async () => {
      if (!api) return;
      try {
        const results = await api.search(searchInput);
        setSearchResults(results.songs);
      } catch {
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);
    return () => { if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current); };
  }, [searchInput, api]);

  const handleLoadAlbum = useCallback(async (album: Album) => {
    if (!api) return;
    setSelectedAlbum(album);
    setIsLoadingAlbum(true);
    try {
      const data = await api.getAlbum(album.id);
      setAlbumTracks(data.tracks);
    } catch {
      setAlbumTracks([]);
      onToast('Failed to load album');
    } finally {
      setIsLoadingAlbum(false);
    }
  }, [api, onToast]);

  const handleAddTrack = useCallback(async (track: Track) => {
    if (addedIds.has(track.id) || addingId === track.id) return;
    setAddingId(track.id);
    try {
      await addToPlaylist(playlist.id, [track.id]);
      setAddedIds(prev => new Set(prev).add(track.id));
      onToast(`Added "${track.title}"`);
    } catch {
      onToast('Failed to add track');
    } finally {
      setAddingId(null);
    }
  }, [addToPlaylist, playlist.id, addedIds, addingId, onToast]);

  const handleAddAll = useCallback(async (tracks: Track[]) => {
    const toAdd = tracks.filter(t => !addedIds.has(t.id));
    if (toAdd.length === 0) return;
    setAddingId('__all__');
    try {
      await addToPlaylist(playlist.id, toAdd.map(t => t.id));
      setAddedIds(prev => {
        const next = new Set(prev);
        toAdd.forEach(t => next.add(t.id));
        return next;
      });
      onToast(`Added ${toAdd.length} tracks`);
    } catch {
      onToast('Failed to add tracks');
    } finally {
      setAddingId(null);
    }
  }, [addToPlaylist, playlist.id, addedIds, onToast]);

  const renderTrackRow = (track: Track, i: number) => {
    const isAdded = addedIds.has(track.id);
    const isAdding = addingId === track.id || addingId === '__all__';

    return (
      <div
        key={`${track.id}-${i}`}
        className={`group flex items-center gap-3 py-2.5 px-3 rounded-lg transition-colors ${
          isAdded ? 'bg-white/[0.03] opacity-60' : 'hover:bg-white/[0.06] cursor-pointer'
        }`}
        onClick={() => !isAdded && handleAddTrack(track)}
      >
        {/* Track art */}
        <div className="w-10 h-10 rounded overflow-hidden bg-neutral-800 flex-shrink-0">
          <img
            src={track.cover || PLACEHOLDER_COVER}
            className="w-full h-full object-cover"
            alt={track.title}
            onError={(e) => { (e.target as HTMLImageElement).src = PLACEHOLDER_COVER; }}
          />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="text-sm text-white truncate">{track.title}</p>
          <p className="text-xs text-white/35 truncate">{track.artist}</p>
        </div>

        {/* Album name */}
        <div className="hidden md:block w-1/4 text-xs text-white/20 truncate">{track.album}</div>

        {/* Duration */}
        <span className="text-[11px] font-mono text-white/25 tabular-nums w-12 text-right">{track.duration}</span>

        {/* Add button */}
        <div className="w-8 h-8 flex items-center justify-center">
          {isAdding ? (
            <CircleNotch size={16} weight="light" className="text-white/40 animate-spin" />
          ) : isAdded ? (
            <Check size={16} weight="bold" className="text-emerald-500" />
          ) : (
            <Plus size={16} weight="light" className="text-white/30 group-hover:text-white transition-colors" />
          )}
        </div>
      </div>
    );
  };

  return (
    <div
      className="absolute inset-0 z-[100] flex flex-col bg-black/90 backdrop-blur-2xl"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-10 py-8 flex-shrink-0">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg overflow-hidden bg-neutral-800 flex-shrink-0">
            <img
              src={playlist.cover}
              className="w-full h-full object-cover"
              alt={playlist.title}
              onError={(e) => { (e.target as HTMLImageElement).src = PLACEHOLDER_COVER; }}
            />
          </div>
          <div>
            <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Adding to</p>
            <h1 className="text-xl font-medium text-white tracking-tight">{playlist.title}</h1>
          </div>
          {addedIds.size > 0 && (
            <span className="ml-4 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold">
              {addedIds.size} added
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="w-10 h-10 rounded-full hover:bg-white/10 flex items-center justify-center text-white/40 hover:text-white transition-colors"
        >
          <X size={20} weight="light" />
        </button>
      </div>

      {/* Mode tabs */}
      <div className="px-10 flex gap-2 mb-6 flex-shrink-0">
        {([
          { mode: 'search' as BrowseMode, icon: <MagnifyingGlass size={14} weight="light" />, label: 'Search' },
          { mode: 'albums' as BrowseMode, icon: <Disc size={14} weight="light" />, label: 'Albums' },
          { mode: 'favorites' as BrowseMode, icon: <Waveform size={14} weight="light" />, label: 'Favorites' },
        ]).map(tab => (
          <button
            key={tab.mode}
            onClick={() => { setBrowseMode(tab.mode); setSelectedAlbum(null); setAlbumTracks([]); }}
            className={`px-5 py-2.5 rounded-full text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-colors ${
              browseMode === tab.mode
                ? 'bg-white text-black'
                : 'border border-white/10 text-white/50 hover:text-white hover:border-white/30'
            }`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto no-scrollbar px-10 pb-10">
        {/* Search mode */}
        {browseMode === 'search' && (
          <div>
            <div className="relative mb-6">
              <MagnifyingGlass size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30" />
              <input
                ref={inputRef}
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search for songs..."
                className="w-full bg-white/5 border border-white/10 rounded-xl py-3.5 pl-12 pr-4 text-sm text-white placeholder:text-white/25 focus:outline-none focus:bg-white/10 focus:border-white/20 transition-colors"
              />
              {isSearching && <CircleNotch size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 animate-spin" />}
            </div>

            {searchResults.length === 0 && searchInput.trim() && !isSearching ? (
              <p className="text-center text-white/30 text-sm py-12">No results found</p>
            ) : searchResults.length === 0 && !searchInput.trim() ? (
              <div className="flex flex-col items-center justify-center py-20">
                <MusicNotesPlus size={48} weight="light" className="text-white/10 mb-4" />
                <p className="text-white/30 text-sm">Search your library to add tracks</p>
              </div>
            ) : (
              <div className="flex flex-col">
                {searchResults.map((track, i) => renderTrackRow(track, i))}
              </div>
            )}
          </div>
        )}

        {/* Albums mode */}
        {browseMode === 'albums' && !selectedAlbum && (
          <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-x-4 gap-y-6">
            {albums.map(album => (
              <div
                key={album.id}
                onClick={() => handleLoadAlbum(album)}
                className="group cursor-pointer"
              >
                <div className="aspect-square w-full rounded-lg overflow-hidden bg-neutral-800 mb-2">
                  <img
                    src={album.cover}
                    className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                    alt={album.title}
                    onError={(e) => { (e.target as HTMLImageElement).src = PLACEHOLDER_COVER; }}
                  />
                </div>
                <p className="text-xs text-white truncate">{album.title}</p>
                <p className="text-[10px] text-white/30 truncate">{album.artist}</p>
              </div>
            ))}
          </div>
        )}

        {/* Album detail in albums mode */}
        {browseMode === 'albums' && selectedAlbum && (
          <div>
            <button
              onClick={() => { setSelectedAlbum(null); setAlbumTracks([]); }}
              className="mb-6 text-xs text-white/40 hover:text-white transition-colors uppercase tracking-wider font-bold"
            >
              &larr; Back to albums
            </button>

            <div className="flex items-center gap-5 mb-8">
              <div className="w-20 h-20 rounded-lg overflow-hidden bg-neutral-800 flex-shrink-0">
                <img
                  src={selectedAlbum.cover}
                  className="w-full h-full object-cover"
                  alt={selectedAlbum.title}
                  onError={(e) => { (e.target as HTMLImageElement).src = PLACEHOLDER_COVER; }}
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-lg font-medium text-white truncate">{selectedAlbum.title}</p>
                <p className="text-sm text-white/40 truncate">{selectedAlbum.artist} {selectedAlbum.year ? `\u00b7 ${selectedAlbum.year}` : ''}</p>
              </div>
              {albumTracks.length > 0 && (
                <button
                  onClick={() => handleAddAll(albumTracks)}
                  disabled={addingId === '__all__'}
                  className="px-5 py-2.5 rounded-full bg-white text-black text-xs font-bold uppercase tracking-wider hover:scale-105 transition-transform disabled:opacity-50 flex items-center gap-2 flex-shrink-0"
                >
                  {addingId === '__all__' ? <CircleNotch size={14} className="animate-spin" /> : <Plus size={14} weight="bold" />}
                  Add All
                </button>
              )}
            </div>

            {isLoadingAlbum ? (
              <div className="flex items-center justify-center py-12">
                <CircleNotch size={32} weight="light" className="text-white/40 animate-spin" />
              </div>
            ) : (
              <div className="flex flex-col">
                {albumTracks.map((track, i) => renderTrackRow(track, i))}
              </div>
            )}
          </div>
        )}

        {/* Favorites mode */}
        {browseMode === 'favorites' && (
          <div>
            {starredTracks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20">
                <Waveform size={48} weight="light" className="text-white/10 mb-4" />
                <p className="text-white/30 text-sm">No favorite tracks yet</p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-4">
                  <p className="text-xs text-white/40 uppercase tracking-wider font-bold">{starredTracks.length} favorites</p>
                  <button
                    onClick={() => handleAddAll(starredTracks)}
                    disabled={addingId === '__all__'}
                    className="px-4 py-2 rounded-full bg-white/10 text-white text-xs font-bold uppercase tracking-wider hover:bg-white/20 transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    {addingId === '__all__' ? <CircleNotch size={14} className="animate-spin" /> : <Plus size={14} weight="bold" />}
                    Add All
                  </button>
                </div>
                <div className="flex flex-col">
                  {starredTracks.map((track, i) => renderTrackRow(track, i))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
