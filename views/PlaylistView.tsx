import React, { useEffect, useState, useRef } from 'react';
import { HardDrives, CircleNotch, CloudSlash, PencilSimple, Check, X, SpeakerHigh, ArrowsClockwise } from '@phosphor-icons/react';
import { ChromeIcon } from '../components/ChromeIcon';
import { useServer } from '../context/ServerContext';
import { useAudio } from '../context/AudioContext';
import { Track, Playlist } from '../types';
import { ArtistLink } from '../components/ArtistLink';

interface PlaylistViewProps {
  playlistId?: string;
  onPlayTrack: (track: Track, queue?: Track[]) => void;
  onNavigateToArtist: (id: string) => void;
  onContextMenu: (e: React.MouseEvent, item: any, type: string) => void;
  onToast: (msg: string) => void;
  onSelectPlaylist: (id: string) => void;
}

export const PlaylistView: React.FC<PlaylistViewProps> = ({ playlistId, onPlayTrack, onNavigateToArtist, onContextMenu, onToast, onSelectPlaylist }) => {
  const { state, api, playlists, isLoadingPlaylists, refreshPlaylists, updatePlaylistInfo, toggleStar } = useServer();
  const { state: audioState } = useAudio();
  const [playlistTracks, setPlaylistTracks] = useState<Track[]>([]);
  const [isLoadingTracks, setIsLoadingTracks] = useState(false);
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);
  const [editingPlaylistId, setEditingPlaylistId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editingDesc, setEditingDesc] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);

  const currentTrackId = audioState.currentTrack?.id;
  const isPlaying = audioState.isPlaying;

  useEffect(() => {
    if (editingPlaylistId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingPlaylistId]);

  const handleStartEdit = (e: React.MouseEvent, pl: Playlist) => {
    e.stopPropagation();
    setEditingPlaylistId(pl.id);
    setEditingName(pl.title);
    setEditingDesc(pl.desc || '');
  };

  const handleCancelEdit = () => {
    setEditingPlaylistId(null);
    setEditingName('');
    setEditingDesc('');
  };

  const handleSaveEdit = async (id: string) => {
    if (!editingName.trim()) {
      handleCancelEdit();
      return;
    }
    try {
      await updatePlaylistInfo(id, editingName.trim(), editingDesc.trim());
      if (selectedPlaylist && selectedPlaylist.id === id) {
        setSelectedPlaylist({ ...selectedPlaylist, title: editingName.trim(), desc: editingDesc.trim() });
      }
      onToast('Playlist updated');
    } catch {
      onToast('Failed to update playlist');
    }
    handleCancelEdit();
  };

  const handleKeyDown = (e: React.KeyboardEvent, id: string) => {
    if (e.key === 'Enter') {
      handleSaveEdit(id);
    } else if (e.key === 'Escape') {
      handleCancelEdit();
    }
  };

  useEffect(() => {
    if (playlistId && api) {
      setIsLoadingTracks(true);
      api.getPlaylist(playlistId)
        .then(data => {
          setSelectedPlaylist(data.playlist);
          setPlaylistTracks(data.tracks);
        })
        .catch(err => {
          console.error('Failed to load playlist:', err);
          onToast('Failed to load playlist');
        })
        .finally(() => setIsLoadingTracks(false));
    } else {
      setPlaylistTracks([]);
      setSelectedPlaylist(null);
    }
  }, [playlistId, api, onToast]);

  if (!state.isConnected) {
    return (
      <div className="animate-fade-in pb-40 flex flex-col items-center justify-center min-h-[60vh]">
        <CloudSlash size={64} weight="light" className="text-white/20 mb-6" />
        <h2 className="text-2xl font-bold text-white/60 mb-2">Not Connected</h2>
        <p className="text-white/40 text-sm">Go to Settings to connect to your Navidrome server.</p>
      </div>
    );
  }

  // ─── Grid View (no playlistId) ───
  if (!playlistId) {
    if (isLoadingPlaylists && playlists.length === 0) {
      return (
        <div className="animate-fade-in pb-40 flex flex-col items-center justify-center min-h-[60vh]">
          <CircleNotch size={48} weight="light" className="text-white/40 animate-spin mb-4" />
          <p className="text-white/40 text-sm">Loading playlists...</p>
        </div>
      );
    }

    return (
        <div className="animate-fade-in pb-40">
            {/* Header */}
            <header className="flex items-end justify-between mb-8 sticky top-0 z-20 py-4 mix-blend-difference select-none">
                <div>
                    <h1 className="text-7xl font-medium tracking-tighter text-white mb-2">Playlists</h1>
                    <p className="text-white/50 text-sm tracking-wide font-mono flex items-center gap-3">
                        <span className="flex items-center gap-1.5"><HardDrives size={14} weight="light"/> NAVIDROME</span>
                        <span className="w-1 h-1 rounded-full bg-white/30"></span>
                        <span>{playlists.length} COLLECTIONS</span>
                        {isLoadingPlaylists && <CircleNotch size={12} weight="bold" className="animate-spin ml-2" />}
                    </p>
                </div>
                <div className="flex gap-2">
                    <button className="px-6 py-2 rounded-full border border-white/20 bg-white text-black text-xs font-bold uppercase hover:scale-105 transition-transform">All</button>
                    <button
                        onClick={() => refreshPlaylists()}
                        disabled={isLoadingPlaylists}
                        className="px-6 py-2 rounded-full border border-white/10 bg-transparent text-xs font-bold uppercase text-white/50 hover:text-white hover:border-white/40 transition-colors flex items-center gap-2 disabled:opacity-50"
                    >
                        <ArrowsClockwise size={13} weight="light" className={isLoadingPlaylists ? 'animate-spin' : ''} />
                        Refresh
                    </button>
                </div>
            </header>

            {playlists.length === 0 ? (
              <div className="flex flex-col items-center justify-center min-h-[40vh]">
                <p className="text-white/40 text-sm">No playlists found.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-8">
                  {playlists.map((pl) => (
                      <div
                          key={pl.id}
                          onClick={() => editingPlaylistId === pl.id ? undefined : onSelectPlaylist(pl.id)}
                          className="group cursor-pointer"
                      >
                          {/* Cover */}
                          <div className="aspect-square w-full rounded-lg overflow-hidden bg-neutral-800 relative mb-3">
                              <img
                                  src={pl.cover}
                                  className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity duration-200"
                                  alt={pl.title}
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).src = `https://picsum.photos/seed/${pl.id}/400/400`;
                                  }}
                              />
                          </div>

                          {/* Info */}
                          {editingPlaylistId === pl.id ? (
                            <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
                              <input
                                ref={editInputRef}
                                type="text"
                                value={editingName}
                                onChange={(e) => setEditingName(e.target.value)}
                                onKeyDown={(e) => handleKeyDown(e, pl.id)}
                                placeholder="Playlist name"
                                className="w-full bg-white/10 border border-white/20 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-white/40"
                              />
                              <input
                                type="text"
                                value={editingDesc}
                                onChange={(e) => setEditingDesc(e.target.value)}
                                onKeyDown={(e) => handleKeyDown(e, pl.id)}
                                placeholder="Description (optional)"
                                className="w-full bg-white/10 border border-white/20 rounded px-3 py-1.5 text-xs text-white/70 focus:outline-none focus:border-white/40"
                              />
                              <div className="flex gap-2">
                                <button
                                  onClick={() => handleSaveEdit(pl.id)}
                                  className="p-1.5 rounded-full hover:bg-white/10 text-purple-500 transition-colors"
                                >
                                  <Check size={16} weight="bold" />
                                </button>
                                <button
                                  onClick={handleCancelEdit}
                                  className="p-1.5 rounded-full hover:bg-white/10 text-white/40 hover:text-white transition-colors"
                                >
                                  <X size={16} weight="bold" />
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div>
                              <div className="flex items-center gap-1.5">
                                <h3 className="text-sm font-medium text-white truncate">{pl.title}</h3>
                                <button
                                  onClick={(e) => handleStartEdit(e, pl)}
                                  className="flex-shrink-0 p-1 rounded-full opacity-0 group-hover:opacity-100 hover:bg-white/10 text-white/30 hover:text-white transition-opacity"
                                  title="Edit playlist"
                                >
                                  <PencilSimple size={12} weight="light" />
                                </button>
                              </div>
                              <p className="text-xs text-white/30 mt-0.5">{pl.count} tracks</p>
                            </div>
                          )}
                      </div>
                  ))}
              </div>
            )}
        </div>
    );
  }

  // ─── Detail View ───
  const playlist = selectedPlaylist || playlists.find(p => p.id === playlistId);

  if (isLoadingTracks) {
    return (
      <div className="animate-fade-in pb-40 flex flex-col items-center justify-center min-h-[60vh]">
        <CircleNotch size={48} weight="light" className="text-white/40 animate-spin mb-4" />
        <p className="text-white/40 text-sm">Loading playlist...</p>
      </div>
    );
  }

  if (!playlist) {
    return (
      <div className="animate-fade-in pb-40 flex flex-col items-center justify-center min-h-[60vh]">
        <p className="text-white/40 text-sm">Playlist not found.</p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in pb-40 h-full flex flex-col lg:flex-row gap-12">

      {/* LEFT: Sticky cover + info */}
      <div className="lg:w-[340px] flex-shrink-0">
         <div className="sticky top-8">
            <div className="aspect-square w-full rounded-lg overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.4)] mb-8 border border-white/[0.06] relative group">
               <img
                 src={playlist.cover}
                 className="w-full h-full object-cover"
                 alt="Playlist Cover"
                 onError={(e) => {
                   (e.target as HTMLImageElement).src = `https://picsum.photos/seed/${playlist.id}/400/400`;
                 }}
               />
               <div className="absolute inset-0 bg-white/5 mix-blend-overlay"></div>
            </div>

            <div className="flex items-center gap-3 mb-4">
                <span className="w-2 h-2 bg-purple-500 rounded-full animate-pulse"></span>
                <span className="text-xs font-mono text-purple-500 uppercase tracking-widest">Playlist</span>
            </div>

            {editingPlaylistId === playlist.id ? (
              <div className="mb-6">
                <input
                  ref={editInputRef}
                  type="text"
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onKeyDown={(e) => handleKeyDown(e, playlist.id)}
                  placeholder="Playlist name"
                  className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-2xl font-medium tracking-tighter text-white focus:outline-none focus:border-white/40 mb-3"
                />
                <textarea
                  value={editingDesc}
                  onChange={(e) => setEditingDesc(e.target.value)}
                  placeholder="Description (optional)"
                  rows={3}
                  className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-sm text-white/70 focus:outline-none focus:border-white/40 resize-none"
                />
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => handleSaveEdit(playlist.id)}
                    className="px-4 py-2 rounded-full bg-purple-500 text-black text-xs font-bold uppercase hover:bg-purple-400 transition-colors"
                  >
                    Save
                  </button>
                  <button
                    onClick={handleCancelEdit}
                    className="px-4 py-2 rounded-full border border-white/20 text-white/60 text-xs font-bold uppercase hover:text-white hover:border-white/40 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="group/title flex items-start gap-3 mb-4">
                <h1 className="text-2xl font-medium tracking-tight text-white leading-tight line-clamp-3" title={playlist.title}>{playlist.title}</h1>
                <button
                  onClick={(e) => handleStartEdit(e, playlist)}
                  className="flex-shrink-0 p-2 rounded-full opacity-0 group-hover/title:opacity-100 hover:bg-white/10 text-white/40 hover:text-white transition-colors mt-0.5"
                  title="Edit playlist"
                >
                  <PencilSimple size={16} weight="light" />
                </button>
              </div>
            )}

            {editingPlaylistId !== playlist.id && (
              <div className="text-white/40 text-sm mb-8 border-l border-white/20 pl-4 space-y-1">
                <p className="font-light leading-relaxed">{playlist.desc || 'No description'}</p>
                <p className="text-white/25 text-xs font-mono">{playlist.count} TRACKS</p>
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={() => { if (playlistTracks.length > 0) onPlayTrack(playlistTracks[0], playlistTracks); }} className="flex-1 py-4 bg-white text-black rounded-full font-bold text-xs uppercase tracking-widest hover:scale-[1.02] transition-transform shadow-[0_0_20px_rgba(255,255,255,0.15)]">
                Play All
              </button>
              <button onClick={() => onToast("Downloading Playlist...")} className="w-14 h-14 rounded-full border border-white/20 flex items-center justify-center hover:bg-white/10 transition-colors text-white">
                <ChromeIcon name="fast-forward" size={20} />
              </button>
            </div>
         </div>
      </div>

      {/* RIGHT: Track list */}
      <div className="flex-1 min-w-0 pt-2">
         {playlistTracks.length === 0 ? (
           <div className="flex flex-col items-center justify-center min-h-[40vh]">
             <p className="text-white/40 text-sm">No tracks in this playlist.</p>
           </div>
         ) : (
           <div className="flex flex-col">
              {playlistTracks.map((track, i) => {
                 const isCurrentTrack = track.id === currentTrackId;
                 return (
                   <div
                      key={track.id}
                      onClick={() => onPlayTrack(track, playlistTracks)}
                      onContextMenu={(e) => onContextMenu(e, track, "Track")}
                      className={`group flex items-center gap-3 py-2.5 px-3 rounded-lg cursor-pointer transition-colors ${
                        isCurrentTrack ? 'bg-white/[0.06]' : 'hover:bg-white/[0.04]'
                      }`}
                   >
                      {/* Index / playing indicator */}
                      <span className="w-6 text-center text-sm font-mono flex items-center justify-center">
                        {isCurrentTrack ? (
                          isPlaying ? (
                            <div className="flex gap-0.5 items-end h-4">
                              <div className="w-0.5 bg-purple-500 rounded-full animate-[bounce_1s_infinite]" style={{ height: '60%' }}></div>
                              <div className="w-0.5 bg-purple-500 rounded-full animate-[bounce_1.2s_infinite]" style={{ height: '100%' }}></div>
                              <div className="w-0.5 bg-purple-500 rounded-full animate-[bounce_0.8s_infinite]" style={{ height: '40%' }}></div>
                            </div>
                          ) : (
                            <SpeakerHigh size={14} weight="fill" className="text-purple-500" />
                          )
                        ) : (
                          <span className="text-[11px] text-white/20">{(i + 1).toString().padStart(2, '0')}</span>
                        )}
                      </span>

                      {/* Album art per track */}
                      <div className="w-10 h-10 rounded overflow-hidden bg-neutral-800 flex-shrink-0">
                          <img
                              src={track.cover || `https://picsum.photos/seed/${track.id}/100/100`}
                              className="w-full h-full object-cover"
                              alt={track.title}
                              onError={(e) => {
                                  (e.target as HTMLImageElement).src = `https://picsum.photos/seed/${track.id}/100/100`;
                              }}
                          />
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                         <p className={`text-sm truncate ${isCurrentTrack ? 'text-purple-500' : 'text-white'}`}>{track.title}</p>
                         <p className="text-xs text-white/35 truncate">
                           <ArtistLink artistName={track.artist} artistId={track.artistId} onNavigate={onNavigateToArtist} />
                         </p>
                      </div>

                      {/* Album name */}
                      <div className="hidden md:block w-1/4 text-xs text-white/20 truncate">
                          {track.album}
                      </div>

                      {/* Duration */}
                      <span className="text-[11px] font-mono text-white/25 tabular-nums w-12 text-right">{track.duration}</span>

                      {/* Favorite */}
                      <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            const success = await toggleStar(track.id, 'song', track.liked);
                            if (success) {
                              setPlaylistTracks(prev => prev.map(t =>
                                t.id === track.id ? { ...t, liked: !t.liked } : t
                              ));
                              onToast(track.liked ? "Removed from favorites" : "Added to favorites");
                            } else {
                              onToast("Failed to update favorite");
                            }
                          }}
                          className={`w-7 h-7 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors ${track.liked ? 'text-rose-500' : 'text-white/20 hover:text-white opacity-0 group-hover:opacity-100'}`}
                      >
                          <ChromeIcon name="heart" size={14} className={track.liked ? 'opacity-100' : 'opacity-50'} />
                      </button>
                   </div>
                 );
              })}
           </div>
         )}
      </div>
    </div>
  );
};
