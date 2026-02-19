import React, { useEffect, useState, useRef } from 'react';
import { CircleNotch, CloudSlash, SpeakerHigh } from '@phosphor-icons/react';
import { ChromeIcon } from '../components/ChromeIcon';
import { useServer } from '../context/ServerContext';
import { useAudio } from '../context/AudioContext';
import { Track, Album } from '../types';
import { ArtistLink } from '../components/ArtistLink';
import { useAlbumInfo } from '../hooks/useAlbumInfo';
import { SourceBadge } from '../components/SourceBadge';
import { PLACEHOLDER_COVER } from '../utils/placeholders';

interface AlbumViewProps {
  albumId?: string;
  onPlayTrack: (track: Track, queue?: Track[]) => void;
  onNavigateToArtist: (id: string) => void;
  onContextMenu: (e: React.MouseEvent, item: any, type: string) => void;
  onToast: (msg: string) => void;
}

export const AlbumView: React.FC<AlbumViewProps> = ({ albumId, onPlayTrack, onNavigateToArtist, onContextMenu, onToast }) => {
  const { state, api, albums, toggleStar } = useServer();
  const { state: audioState } = useAudio();
  const [albumTracks, setAlbumTracks] = useState<Track[]>([]);
  const [isLoadingTracks, setIsLoadingTracks] = useState(false);
  const [selectedAlbum, setSelectedAlbum] = useState<Album | null>(null);
  const [hoveredTrack, setHoveredTrack] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const currentTrackId = audioState.currentTrack?.id;
  const isPlaying = audioState.isPlaying;

  // Toggled off for now
  // const { info: albumInfo, source: albumInfoSource } = useAlbumInfo(
  //   selectedAlbum?.artist,
  //   selectedAlbum?.title
  // );

  useEffect(() => {
    if (albumId && api) {
      setIsLoadingTracks(true);
      api.getAlbum(albumId)
        .then(data => {
          setSelectedAlbum(data.album);
          setAlbumTracks(data.tracks);
        })
        .catch(err => {
          console.error('Failed to load album:', err);
          onToast('Failed to load album');
        })
        .finally(() => setIsLoadingTracks(false));
    } else {
      setAlbumTracks([]);
      setSelectedAlbum(null);
    }
  }, [albumId, api, onToast]);

  if (!state.isConnected) {
    return (
      <div className="animate-fade-in pb-40 flex flex-col items-center justify-center min-h-[60vh]">
        <CloudSlash size={64} weight="light" className="text-white/20 mb-6" />
        <h2 className="text-2xl font-bold text-white/60 mb-2">Not Connected</h2>
        <p className="text-white/40 text-sm">Go to Settings to connect to your Navidrome server.</p>
      </div>
    );
  }

  if (!albumId) {
    return (
      <div className="animate-fade-in pb-40 flex flex-col items-center justify-center min-h-[60vh]">
        <p className="text-white/40 text-sm">No album selected.</p>
      </div>
    );
  }

  const album = selectedAlbum || albums.find(a => a.id === albumId);

  if (isLoadingTracks) {
    return (
      <div className="animate-fade-in pb-40 flex flex-col items-center justify-center min-h-[60vh]">
        <CircleNotch size={48} weight="light" className="text-white/40 animate-spin mb-4" />
        <p className="text-white/40 text-sm">Loading album...</p>
      </div>
    );
  }

  if (!album) {
    return (
      <div className="animate-fade-in pb-40 flex flex-col items-center justify-center min-h-[60vh]">
        <p className="text-white/40 text-sm">Album not found.</p>
      </div>
    );
  }

  // Calculate total duration from tracks
  const totalSeconds = albumTracks.reduce((acc, t) => {
    const parts = t.duration.split(':').map(Number);
    return acc + (parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts[0] * 60 + parts[1]);
  }, 0);
  const totalMin = Math.floor(totalSeconds / 60);

  return (
    <div ref={containerRef} className="album-view-enter -mx-10 -mt-4 pb-40">

      {/* ─── TOP SECTION: Art + Info side by side ─── */}
      <div className="px-10 lg:px-14 pt-8 pb-12">
        <div className="flex gap-10 lg:gap-14 items-start">

          {/* Album cover — square, prominent */}
          <div className="flex-shrink-0 album-art-enter">
            <div className="w-64 h-64 lg:w-80 lg:h-80 xl:w-96 xl:h-96 overflow-hidden shadow-2xl shadow-black/50 relative group">
              <img
                src={album.cover}
                className="w-full h-full object-cover"
                alt={album.title}
                onError={(e) => {
                  (e.target as HTMLImageElement).src = PLACEHOLDER_COVER;
                }}
              />
              {/* Play overlay on hover */}
              <button
                onClick={() => { if (albumTracks.length > 0) onPlayTrack(albumTracks[0], albumTracks); }}
                className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-colors duration-200 cursor-pointer"
              >
                <div className="w-16 h-16 rounded-full bg-white/90 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 shadow-xl">
                  <ChromeIcon name="play" size={24} className="ml-1" />
                </div>
              </button>
            </div>
          </div>

          {/* Album metadata — breathes alongside the cover */}
          <div className="flex-1 min-w-0 pt-4 lg:pt-8 album-info-enter">
            {/* Tiny metadata crumbs */}
            <div className="flex items-center gap-2.5 mb-5 flex-wrap">
              {album.year && (
                <span className="text-[11px] font-mono tracking-wide text-white/35">{album.year}</span>
              )}
              {album.year && <span className="w-0.5 h-0.5 rounded-full bg-white/15" />}
              <span className="text-[10px] font-mono uppercase tracking-wider text-white/25">{album.format}</span>
              <span className="w-0.5 h-0.5 rounded-full bg-white/15" />
              <span className="text-[10px] font-mono tracking-wider text-white/25">{album.trackCount} tracks</span>
              <span className="w-0.5 h-0.5 rounded-full bg-white/15" />
              <span className="text-[10px] font-mono tracking-wider text-white/25">{totalMin} min</span>
              {/* Toggled off for now
              {albumInfo?.label && (
                <>
                  <span className="w-0.5 h-0.5 rounded-full bg-white/15" />
                  <span className="text-[10px] tracking-wider text-white/20">{albumInfo.label}</span>
                </>
              )}
              */}
            </div>

            {/* Title */}
            <h1
              className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-light text-white leading-[0.95] tracking-tight mb-4 max-w-2xl"
              style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
            >
              {album.title}
            </h1>

            {/* Artist */}
            <p className="text-lg text-white/50 font-light mb-8">
              <ArtistLink artistName={album.artist} artistId={album.artistId} onNavigate={onNavigateToArtist} />
            </p>

            {/* Actions */}
            <div className="flex items-center gap-6 mb-8">
              <button
                onClick={() => { if (albumTracks.length > 0) onPlayTrack(albumTracks[0], albumTracks); }}
                className="flex items-center justify-center text-white/50 hover:text-white transition-colors duration-300"
              >
                <ChromeIcon name="play" size={22} />
              </button>
              <button
                onClick={async () => {
                  if (!album) return;
                  const isLiked = album.liked;
                  const success = await toggleStar(album.id, 'album', isLiked);
                  if (success) {
                    setSelectedAlbum(prev => prev ? { ...prev, liked: !isLiked } : prev);
                    onToast(isLiked ? "Removed from favorites" : "Added to favorites");
                  } else {
                    onToast("Failed to update favorite");
                  }
                }}
                className="flex items-center justify-center text-white/50 hover:text-white transition-colors duration-300"
              >
                <ChromeIcon name="heart" size={22} />
              </button>
              <button
                onClick={() => onToast("Downloading Album...")}
                className="flex items-center justify-center text-white/50 hover:text-white transition-colors duration-300"
              >
                <ChromeIcon name="download" size={22} />
              </button>
            </div>

            {/* Toggled off for now
            {albumInfo?.descriptionSummary && (
              <div className="max-w-lg">
                <p
                  className="text-sm text-white/35 leading-relaxed line-clamp-3 mb-3"
                  style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
                >
                  {albumInfo.descriptionSummary}
                </p>
                <div className="flex items-center gap-3 flex-wrap">
                  {albumInfo.genres && albumInfo.genres.length > 0 && (
                    albumInfo.genres.slice(0, 4).map(genre => (
                      <span key={genre} className="px-2.5 py-0.5 text-[9px] uppercase tracking-wider text-white/25 border border-white/6 rounded-sm">
                        {genre}
                      </span>
                    ))
                  )}
                  <SourceBadge source={albumInfoSource} />
                </div>
              </div>
            )}
            */}
          </div>
        </div>
      </div>

      {/* ─── TRACKLIST — Fluid, spacious ─── */}
      <div className="px-10 lg:px-14">
        {albumTracks.length === 0 ? (
          <div className="flex flex-col items-center justify-center min-h-[30vh]">
            <p className="text-white/40 text-sm">No tracks in this album.</p>
          </div>
        ) : (
          <div className="tracklist-enter">
            {albumTracks.map((track, i) => {
              const isCurrentTrack = track.id === currentTrackId;
              const isHovered = hoveredTrack === track.id;

              return (
                <div
                  key={track.id}
                  onClick={() => onPlayTrack(track, albumTracks)}
                  onContextMenu={(e) => onContextMenu(e, track, "Track")}
                  onMouseEnter={() => setHoveredTrack(track.id)}
                  onMouseLeave={() => setHoveredTrack(null)}
                  className={`group flex items-center gap-5 py-3.5 cursor-pointer transition-colors duration-150 relative
                    ${isCurrentTrack ? '' : 'hover:bg-white/[0.02]'}
                  `}
                  style={{
                    animationDelay: `${i * 30}ms`,
                  }}
                >
                  {/* Track number / play indicator */}
                  <span className="w-10 flex-shrink-0 flex items-center justify-center">
                    {isCurrentTrack ? (
                      isPlaying ? (
                        <span className="flex gap-[3px] items-end h-4">
                          <span className="w-[3px] bg-purple-500 rounded-full animate-[bounce_1s_infinite]" style={{ height: '55%' }} />
                          <span className="w-[3px] bg-purple-500 rounded-full animate-[bounce_1.2s_infinite]" style={{ height: '100%' }} />
                          <span className="w-[3px] bg-purple-500 rounded-full animate-[bounce_0.8s_infinite]" style={{ height: '35%' }} />
                        </span>
                      ) : (
                        <ChromeIcon name="pause" size={14} />
                      )
                    ) : isHovered ? (
                      <ChromeIcon name="play" size={14} className="opacity-60" />
                    ) : (
                      <span className="text-sm text-white/15 font-mono tabular-nums">
                        {(i + 1).toString().padStart(2, '0')}
                      </span>
                    )}
                  </span>

                  {/* Title + artist */}
                  <div className="flex-1 min-w-0">
                    <p className={`truncate text-[15px] transition-colors duration-150 ${
                      isCurrentTrack ? 'text-purple-500 font-medium' : 'text-white/80 group-hover:text-white'
                    }`}>
                      {track.title}
                    </p>
                    {track.artist !== album.artist && (
                      <p className="text-[11px] text-white/25 mt-0.5 truncate">
                        <ArtistLink artistName={track.artist} artistId={track.artistId} onNavigate={onNavigateToArtist} />
                      </p>
                    )}
                  </div>

                  {/* Like */}
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      const success = await toggleStar(track.id, 'song', track.liked);
                      if (success) {
                        setAlbumTracks(prev => prev.map(t =>
                          t.id === track.id ? { ...t, liked: !t.liked } : t
                        ));
                        onToast(track.liked ? "Removed from favorites" : "Added to favorites");
                      } else {
                        onToast("Failed to update favorite");
                      }
                    }}
                    className={`flex-shrink-0 p-1.5 transition-colors duration-150 ${
                      track.liked
                        ? 'text-rose-500 opacity-100'
                        : 'text-white/15 opacity-0 group-hover:opacity-100 hover:text-white/50'
                    }`}
                  >
                    <ChromeIcon name="heart" size={13} className={track.liked ? 'opacity-100' : 'opacity-50'} />
                  </button>

                  {/* Duration */}
                  <span className="text-[11px] font-mono text-white/15 tabular-nums flex-shrink-0 w-12 text-right">
                    {track.duration}
                  </span>

                  {/* Active track indicator line */}
                  {isCurrentTrack && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-6 bg-purple-500 rounded-full" />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
