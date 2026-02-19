import React from 'react';
import { useArtistImage, ARTIST_PLACEHOLDER } from '../hooks/useArtistImage';

interface ArtistImageProps {
  artistName: string;
  className?: string;
  style?: React.CSSProperties;
  alt?: string;
  fallbackSrc?: string;
}

/**
 * Component that fetches and displays artist images from Deezer
 * Falls back to a placeholder for unknown artists
 */
export const ArtistImage: React.FC<ArtistImageProps> = ({
  artistName,
  className = '',
  style,
  alt,
  fallbackSrc,
}) => {
  const { imageUrl, isLoading } = useArtistImage(artistName);

  const handleError = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.target as HTMLImageElement;
    img.src = fallbackSrc || ARTIST_PLACEHOLDER;
  };

  return (
    <img
      src={imageUrl}
      alt={alt || artistName}
      className={`${className} ${isLoading ? 'animate-pulse' : ''}`}
      style={style}
      onError={handleError}
      loading="lazy"
      decoding="async"
    />
  );
};
