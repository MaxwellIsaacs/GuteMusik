import React, { useEffect, useState, useRef } from 'react';
import { HardDrives, CircleNotch, CloudSlash, PencilSimple, Check, X, SpeakerHigh, ArrowsClockwise, Trash, XCircle, MusicNotesPlus } from '@phosphor-icons/react';
import { PLACEHOLDER_COVER } from '../utils/placeholders';
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
  onOpenAddMusic?: (playlist: Playlist) => void;
}

export const PlaylistView: React.FC<PlaylistViewProps> = ({ playlistId, onPlayTrack, onNavigateToArtist, onContextMenu, onToast, onSelectPlaylist, onOpenAddMusic }) => {
  const { state, api, playlists, isLoadingPlaylists, refreshPlaylists, updatePlaylistInfo, toggleStar, deletePlaylist, removeFromPlaylist } = useServer();
  const { state: audioState } = useAudio();
  const [playlistTracks, setPlaylistTracks] = useState<Track[]>([]);
  const [isLoadingTracks, setIsLoadingTracks] = useState(false);
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);
  const [editingPlaylistId, setEditingPlaylistId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editingDesc, setEditingDesc] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

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

  // ═══════════════════════════════════════════════════════════════════════════════
  // INDEX VIEW — Grid of playlists
  // ═══════════════════════════════════════════════════════════════════════════════
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
            {/* Header — matches Artists/Library pages */}
            <header className="flex items-end justify-between mb-12 sticky top-0 z-20 py-4 mix-blend-difference select-none">
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
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-x-5 gap-y-8">
                  {playlists.map((pl) => (
                      <div
                          key={pl.id}
                          onClick={() => editingPlaylistId === pl.id ? undefined : onSelectPlaylist(pl.id)}
                          className="group cursor-pointer"
                      >
                          {/* Cover — hover effects matching Library */}
                          <div className="aspect-square w-full overflow-hidden bg-neutral-800 relative">
                              <img
                                  src={pl.cover}
                                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                  alt={pl.title}
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).src = PLACEHOLDER_COVER;
                                  }}
                              />
                              <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
                              <div className="absolute bottom-2 left-2 px-1.5 py-0.5 bg-black/60 rounded text-[9px] font-mono text-white/80 opacity-0 group-hover:opacity-100 transition-opacity">
                                  {pl.count}
                              </div>
                          </div>

                          {/* Info */}
                          {editingPlaylistId === pl.id ? (
                            <div className="space-y-2 mt-3" onClick={(e) => e.stopPropagation()}>
                              <input
                                ref={editInputRef}
                                type="text"
                                value={editingName}
                                onChange={(e) => setEditingName(e.target.value)}
                                onKeyDown={(e) => handleKeyDown(e, pl.id)}
                                placeholder="Playlist name"
                                className="w-full bg-white/5 border border-white/5 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:bg-white/10 focus:border-white/20 transition-colors"
                              />
                              <input
                                type="text"
                                value={editingDesc}
                                onChange={(e) => setEditingDesc(e.target.value)}
                                onKeyDown={(e) => handleKeyDown(e, pl.id)}
                                placeholder="Description (optional)"
                                className="w-full bg-white/5 border border-white/5 rounded-lg px-3 py-1.5 text-xs text-white/70 focus:outline-none focus:bg-white/10 focus:border-white/20 transition-colors"
                              />
                              <div className="flex gap-2">
                                <button
                                  onClick={() => handleSaveEdit(pl.id)}
                                  className="p-1.5 rounded-full hover:bg-white/10 text-white/60 hover:text-white transition-colors"
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
                            <div className="mt-3">
                              <div className="flex items-center gap-1.5">
                                <h3 className="text-sm font-normal text-white leading-snug truncate">{pl.title}</h3>
                                <button
                                  onClick={(e) => handleStartEdit(e, pl)}
                                  className="flex-shrink-0 p-1 rounded-full opacity-0 group-hover:opacity-100 hover:bg-white/10 text-white/30 hover:text-white transition-opacity"
                                  title="Edit playlist"
                                >
                                  <PencilSimple size={12} weight="light" />
                                </button>
                              </div>
                              <p className="text-white/30 text-xs mt-1">{pl.count} tracks</p>
                            </div>
                          )}
                      </div>
                  ))}
              </div>
            )}
        </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // DETAIL VIEW — Hero + track list (matching Artist detail page layout)
  // ═══════════════════════════════════════════════════════════════════════════════
  const playlist = selectedPlaylist || playlists.find(p => p.id === playlistId);

  if (isLoadingTracks) {
    return (
      <div className="animate-fade-in pb-40 flex flex-col items-center justify-center min-h-[60vh]">
        <CircleNotch size={32} weight="light" className="text-white/40 animate-spin" />
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
    <div className="animate-fade-in -mx-10 -mt-4 pb-40">

      {/* ═══════════════ HERO — Cover + Info side by side ═══════════════ */}
      <div className="px-10 lg:px-14 pt-8 pb-12">
        <div className="flex gap-10 lg:gap-14 items-start">

          {/* Cover art */}
          <div className="flex-shrink-0">
            <div className="w-64 h-64 lg:w-80 lg:h-80 overflow-hidden shadow-2xl shadow-black/50 relative">
              <img
                src={playlist.cover}
                className="w-full h-full object-cover"
                alt="Playlist Cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = PLACEHOLDER_COVER;
                }}
              />
            </div>
          </div>

          {/* Metadata */}
          <div className="flex-1 min-w-0 pt-4 lg:pt-8">

            {/* Crumbs */}
            <div className="flex items-center gap-2.5 mb-5 flex-wrap">
              <span className="text-[10px] font-mono tracking-wider text-white/25 uppercase">Playlist</span>
              <span className="w-0.5 h-0.5 rounded-full bg-white/15" />
              <span className="text-[10px] font-mono tracking-wider text-white/25">{playlistTracks.length} tracks</span>
            </div>

            {/* Title (editable) */}
            {editingPlaylistId === playlist.id ? (
              <div className="mb-6 max-w-lg">
                <input
                  ref={editInputRef}
                  type="text"
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onKeyDown={(e) => handleKeyDown(e, playlist.id)}
                  placeholder="Playlist name"
                  className="w-full bg-white/5 border border-white/5 rounded-xl px-5 py-3 text-2xl font-light tracking-tight text-white focus:outline-none focus:bg-white/10 focus:border-white/20 transition-colors mb-3"
                />
                <textarea
                  value={editingDesc}
                  onChange={(e) => setEditingDesc(e.target.value)}
                  placeholder="Description (optional)"
                  rows={3}
                  className="w-full bg-white/5 border border-white/5 rounded-xl px-5 py-3 text-sm text-white/70 focus:outline-none focus:bg-white/10 focus:border-white/20 transition-colors resize-none"
                />
                <div className="flex gap-3 mt-3">
                  <button
                    onClick={() => handleSaveEdit(playlist.id)}
                    className="px-5 py-2 rounded-full bg-white text-black text-xs font-bold uppercase hover:bg-white/90 transition-colors"
                  >
                    Save
                  </button>
                  <button
                    onClick={handleCancelEdit}
                    className="px-5 py-2 rounded-full border border-white/10 text-white/60 text-xs font-bold uppercase hover:text-white hover:border-white/20 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="group/title flex items-start gap-3 mb-4">
                <h1
                  className="text-4xl sm:text-5xl lg:text-6xl font-light text-white leading-[0.95] tracking-tight max-w-2xl"
                  style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
                  title={playlist.title}
                >
                  {playlist.title}
                </h1>
                <button
                  onClick={(e) => handleStartEdit(e, playlist)}
                  className="flex-shrink-0 p-2 rounded-full opacity-0 group-hover/title:opacity-100 hover:bg-white/10 text-white/40 hover:text-white transition-colors mt-2"
                  title="Edit playlist"
                >
                  <PencilSimple size={16} weight="light" />
                </button>
              </div>
            )}

            {/* Description */}
            {editingPlaylistId !== playlist.id && playlist.desc && (
              <p
                className="text-sm text-white/35 leading-relaxed mb-8 max-w-lg"
                style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
              >
                {playlist.desc}
              </p>
            )}

            {editingPlaylistId !== playlist.id && !playlist.desc && (
              <div className="mb-8" />
            )}

            {/* Actions — icon-only, matching Artist detail page */}
            <div className="flex items-center gap-6 mb-8">
              <button
                onClick={() => { if (playlistTracks.length > 0) onPlayTrack(playlistTracks[0], playlistTracks); }}
                className="flex items-center justify-center text-white/50 hover:text-white transition-colors duration-300"
                title="Play All"
              >
                <ChromeIcon name="play" size={22} />
              </button>
              <button
                onClick={() => onOpenAddMusic?.(playlist)}
                className="flex items-center justify-center text-white/50 hover:text-white transition-colors duration-300"
                title="Add music"
              >
                <MusicNotesPlus size={22} weight="light" />
              </button>
              <button
                onClick={() => onToast("Downloading Playlist...")}
                className="flex items-center justify-center text-white/50 hover:text-white transition-colors duration-300"
                title="Download"
              >
                <ChromeIcon name="download" size={22} />
              </button>
            </div>

            {/* Delete */}
            {confirmDeleteId === playlistId ? (
              <div className="flex items-center gap-4">
                <span className="text-xs text-red-400">Delete this playlist?</span>
                <button
                  onClick={async () => {
                    try {
                      await deletePlaylist(playlistId!);
                      onToast('Playlist deleted');
                      onSelectPlaylist('');
                      setConfirmDeleteId(null);
                    } catch {
                      onToast('Failed to delete playlist');
                    }
                  }}
                  className="text-[10px] font-mono text-red-400 hover:text-red-300 transition-colors uppercase tracking-wider"
                >
                  Confirm
                </button>
                <button
                  onClick={() => setConfirmDeleteId(null)}
                  className="text-[10px] font-mono text-white/30 hover:text-white/60 transition-colors uppercase tracking-wider"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDeleteId(playlistId!)}
                className="text-[10px] font-mono text-white/20 hover:text-red-400 transition-colors uppercase tracking-wider flex items-center gap-1.5"
              >
                <Trash size={11} weight="light" /> Delete Playlist
              </button>
            )}

          </div>
        </div>
      </div>

      {/* ═══════════════ TRACKS — Full-width section ═══════════════ */}
      <div className="px-10 lg:px-14 pb-20">
        <div className="flex items-center gap-3 mb-8">
          <span className="text-[10px] font-mono uppercase tracking-[0.3em] text-white/20">Tracks</span>
          <span className="text-[10px] font-mono text-white/10">{playlistTracks.length}</span>
        </div>

        {playlistTracks.length === 0 ? (
          <div className="flex flex-col items-center justify-center min-h-[20vh]">
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
                          <div className="w-0.5 bg-white rounded-full animate-[bounce_1s_infinite]" style={{ height: '60%' }}></div>
                          <div className="w-0.5 bg-white rounded-full animate-[bounce_1.2s_infinite]" style={{ height: '100%' }}></div>
                          <div className="w-0.5 bg-white rounded-full animate-[bounce_0.8s_infinite]" style={{ height: '40%' }}></div>
                        </div>
                      ) : (
                        <SpeakerHigh size={14} weight="fill" className="text-white" />
                      )
                    ) : (
                      <span className="text-[10px] text-white/20 font-mono">{String(i + 1).padStart(2, '0')}</span>
                    )}
                  </span>

                  {/* Album art per track */}
                  <div className="w-10 h-10 rounded overflow-hidden bg-neutral-800 flex-shrink-0">
                    <img
                      src={track.cover || PLACEHOLDER_COVER}
                      className="w-full h-full object-cover"
                      alt={track.title}
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = PLACEHOLDER_COVER;
                      }}
                    />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm truncate ${isCurrentTrack ? 'text-white' : 'text-white/70'}`}>{track.title}</p>
                    <p className="text-xs text-white/30 truncate">
                      <ArtistLink artistName={track.artist} artistId={track.artistId} onNavigate={onNavigateToArtist} />
                    </p>
                  </div>

                  {/* Album name */}
                  <div className="hidden md:block w-1/4 text-xs text-white/20 truncate">
                    {track.album}
                  </div>

                  {/* Duration */}
                  <span className="text-[10px] font-mono text-white/20 tabular-nums w-12 text-right">{track.duration}</span>

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

                  {/* Remove from playlist */}
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      try {
                        await removeFromPlaylist(playlistId!, [i]);
                        setPlaylistTracks(prev => prev.filter((_, idx) => idx !== i));
                        onToast("Removed from playlist");
                      } catch {
                        onToast("Failed to remove track");
                      }
                    }}
                    className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors text-white/20 hover:text-red-400 opacity-0 group-hover:opacity-100"
                    title="Remove from playlist"
                  >
                    <XCircle size={14} weight="light" />
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
