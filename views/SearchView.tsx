import React from 'react';
import { CircleNotch, User, Disc } from '@phosphor-icons/react';
import { ChromeIcon } from '../components/ChromeIcon';
import { useServer } from '../context/ServerContext';
import { Track, Album, Artist } from '../types';
import { ArtistLink } from '../components/ArtistLink';
import { ArtistImage } from '../components/ArtistImage';
import { PLACEHOLDER_COVER } from '../utils/placeholders';

interface SearchViewProps {
  onPlayTrack: (track: Track, queue?: Track[]) => void;
  onNavigateToAlbum: (id: string) => void;
  onNavigateToArtist: (id: string) => void;
  onContextMenu: (e: React.MouseEvent, item: any, type: string) => void;
}

export const SearchView: React.FC<SearchViewProps> = ({
  onPlayTrack,
  onNavigateToAlbum,
  onNavigateToArtist,
  onContextMenu,
}) => {
  const { searchQuery, searchResults, isSearching } = useServer();
  const { songs, albums, artists } = searchResults;
  const hasResults = songs.length > 0 || albums.length > 0 || artists.length > 0;

  if (isSearching) {
    return (
      <div className="animate-fade-in pb-40 flex flex-col items-center justify-center min-h-[60vh]">
        <CircleNotch size={48} weight="light" className="text-white/40 animate-spin mb-4" />
        <p className="text-white/40 text-sm">Searching...</p>
      </div>
    );
  }

  if (!hasResults) {
    return (
      <div className="animate-fade-in pb-40 flex flex-col items-center justify-center min-h-[60vh]">
        <ChromeIcon name="search" size={64} className="opacity-20 mb-6" />
        <h2 className="text-2xl font-bold text-white/60 mb-2">No results found</h2>
        <p className="text-white/40 text-sm">Try a different search term.</p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in pb-40">
      <header className="mb-8 sticky top-0 z-20 py-4 mix-blend-difference select-none">
        <h1 className="text-5xl font-medium tracking-tighter text-white mb-2">
          Results for "{searchQuery}"
        </h1>
        <p className="text-white/50 text-sm tracking-wide font-mono flex items-center gap-3">
          <span>{songs.length} TRACKS</span>
          <span className="w-1 h-1 rounded-full bg-white/30"></span>
          <span>{albums.length} ALBUMS</span>
          <span className="w-1 h-1 rounded-full bg-white/30"></span>
          <span>{artists.length} ARTISTS</span>
        </p>
      </header>

      <div className="space-y-10">
        {/* Artists Section */}
        {artists.length > 0 && (
          <section>
            <h2 className="text-sm font-bold text-white/50 uppercase tracking-widest mb-4 flex items-center gap-2">
              <User size={14} weight="light" />
              Artists
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {artists.map((artist: Artist) => (
                <div
                  key={artist.id}
                  onClick={() => onNavigateToArtist(artist.id)}
                  className="group cursor-pointer"
                >
                  <div className="relative aspect-square rounded-full overflow-hidden mb-3 bg-white/5">
                    <ArtistImage
                      artistName={artist.name}
                      className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                      alt={artist.name}
                    />
                    <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <h3 className="text-sm font-medium text-white truncate text-center group-hover:text-white/80 transition-colors">
                    {artist.name}
                  </h3>
                  <p className="text-xs text-white/40 truncate text-center">
                    {artist.albumCount} albums
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Albums Section */}
        {albums.length > 0 && (
          <section>
            <h2 className="text-sm font-bold text-white/50 uppercase tracking-widest mb-4 flex items-center gap-2">
              <Disc size={14} weight="light" />
              Albums
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {albums.map((album: Album) => (
                <div
                  key={album.id}
                  onClick={() => onNavigateToAlbum(album.id)}
                  onContextMenu={(e) => onContextMenu(e, album, 'Album')}
                  className="group cursor-pointer"
                >
                  <div className="relative aspect-square rounded-lg overflow-hidden mb-3 bg-white/5">
                    <img
                      src={album.cover}
                      loading="lazy"
                      className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      alt={album.title}
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = PLACEHOLDER_COVER;
                      }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    <button
                      onClick={(e) => { e.stopPropagation(); onNavigateToAlbum(album.id); }}
                      className="absolute bottom-3 right-3 w-10 h-10 bg-white text-black rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                    >
                      <ChromeIcon name="play" size={16} />
                    </button>
                  </div>
                  <h3 className="text-sm font-medium text-white truncate group-hover:text-white/80 transition-colors">
                    {album.title}
                  </h3>
                  <p className="text-xs text-white/40 truncate">
                    <ArtistLink artistName={album.artist} artistId={album.artistId} onNavigate={onNavigateToArtist} /> {album.year && `• ${album.year}`}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Tracks Section */}
        {songs.length > 0 && (
          <section>
            <h2 className="text-sm font-bold text-white/50 uppercase tracking-widest mb-4 flex items-center gap-2">
              <ChromeIcon name="music-note" size={14} />
              Tracks
            </h2>
            <div className="space-y-1">
              {songs.map((track: Track) => (
                <div
                  key={track.id}
                  onClick={() => onPlayTrack(track, songs)}
                  onContextMenu={(e) => onContextMenu(e, track, 'Track')}
                  className="group flex items-center gap-4 p-3 rounded-lg cursor-pointer hover:bg-white/[0.06] transition-colors"
                >
                  <div className="relative w-12 h-12 rounded overflow-hidden bg-white/5 flex-shrink-0">
                    <img
                      src={track.cover}
                      className="w-full h-full object-cover"
                      alt={track.title}
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = PLACEHOLDER_COVER;
                      }}
                    />
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <ChromeIcon name="play" size={16} />
                    </div>
                  </div>
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
          </section>
        )}
      </div>
    </div>
  );
};
