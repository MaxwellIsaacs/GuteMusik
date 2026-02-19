import React, { useState } from 'react';
import { X, SpinnerGap } from '@phosphor-icons/react';
import { ChromeIcon } from './ChromeIcon';
import { useAlbumCover } from '../hooks/useAlbumCover';
import { usePlatform } from '../hooks/usePlatform';
import { PLACEHOLDER_COVER } from '../utils/placeholders';

interface AlbumArtProps {
  serverCover?: string;
  artist?: string;
  album?: string;
  trackId?: string;
  className?: string;
  alt?: string;
  onSaveCover?: (coverUrl: string) => Promise<void>;
}

/**
 * Album art component with iTunes fallback and save functionality
 * Shows a non-invasive popup when clicking on a fallback cover
 */
export const AlbumArt: React.FC<AlbumArtProps> = ({
  serverCover,
  artist,
  album,
  trackId,
  className = '',
  alt,
  onSaveCover,
}) => {
  const { isLinux } = usePlatform();
  const { coverUrl, isFallback, isLoading, fallbackSource } = useAlbumCover(
    serverCover,
    artist,
    album,
    trackId
  );

  const [showPopup, setShowPopup] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const handleClick = (e: React.MouseEvent) => {
    if (isFallback && fallbackSource && onSaveCover) {
      e.stopPropagation();
      setShowPopup(true);
    }
  };

  const handleSave = async () => {
    if (!fallbackSource || !onSaveCover) return;

    setIsSaving(true);
    try {
      await onSaveCover(fallbackSource);
      setShowPopup(false);
    } catch (error) {
      console.error('Failed to save cover:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowPopup(false);
  };

  return (
    <div className="relative w-full h-full">
      <img
        src={coverUrl}
        alt={alt || `${artist} - ${album}`}
        className={`${className} ${isLoading ? 'animate-pulse' : ''} ${isFallback && onSaveCover ? 'cursor-pointer' : ''}`}
        onClick={handleClick}
        loading="lazy"
        decoding="async"
        onError={(e) => {
          const img = e.target as HTMLImageElement;
          img.src = PLACEHOLDER_COVER;
        }}
      />

      {/* Fallback indicator - subtle dot */}
      {isFallback && !showPopup && (
        <div
          className={`absolute bottom-1 right-1 w-2 h-2 bg-amber-500 rounded-full shadow-lg ${isLinux ? '' : 'animate-pulse'}`}
          title="Cover found online - click to save"
        />
      )}

      {/* Non-invasive popup */}
      {showPopup && (
        <div
          className={`absolute inset-0 bg-black/80 ${isLinux ? '' : 'backdrop-blur-sm'} flex flex-col items-center justify-center p-3 z-10 ${isLinux ? '' : 'animate-in fade-in duration-200'}`}
          onClick={handleDismiss}
        >
          <p className="text-white text-xs text-center mb-3 leading-relaxed">
            Cover found online
          </p>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleSave();
            }}
            disabled={isSaving}
            className="flex items-center gap-2 px-3 py-1.5 bg-white text-black rounded-full text-xs font-medium hover:scale-105 transition-transform disabled:opacity-50"
          >
            {isSaving ? (
              <SpinnerGap size={12} className="animate-spin" />
            ) : (
              <ChromeIcon name="download" size={12} />
            )}
            Save
          </button>
          <button
            onClick={handleDismiss}
            className="absolute top-1 right-1 p-1 text-white/50 hover:text-white transition-colors"
          >
            <X size={14} weight="bold" />
          </button>
        </div>
      )}
    </div>
  );
};
