import React, { useMemo } from 'react';
import { useServer } from '../context/ServerContext';

interface ArtistLinkProps {
  artistName: string;
  artistId?: string;
  onNavigate: (artistId: string) => void;
  className?: string;
}

export function ArtistLink({ artistName, artistId, onNavigate, className = '' }: ArtistLinkProps) {
  const { artists } = useServer();

  // Look up artist ID by name if not provided
  const resolvedArtistId = useMemo(() => {
    if (artistId) return artistId;
    const artist = artists.find(a => a.name.toLowerCase() === artistName.toLowerCase());
    return artist?.id;
  }, [artistId, artistName, artists]);

  // Don't make clickable if unknown artist or no ID found
  const isClickable = resolvedArtistId && artistName && artistName !== 'Unknown Artist';

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (resolvedArtistId) {
      onNavigate(resolvedArtistId);
    }
  };

  if (!isClickable) {
    return <span className={className}>{artistName}</span>;
  }

  return (
    <span
      onClick={handleClick}
      className={`cursor-pointer hover:underline hover:text-white transition-colors ${className}`}
    >
      {artistName}
    </span>
  );
}
