import { useState, useEffect } from 'react';
import {
  fetchAlbumCover as fetchAlbumCoverAggregated,
  type SourceInfo,
} from '../services/aggregator';

const DEFAULT_PLACEHOLDER = 'https://picsum.photos/seed/default/400/400';

// Local cache for quick access
const coverCache = new Map<string, { url: string; source: SourceInfo | null }>();
const missingCovers = new Set<string>();

/**
 * Check if a server cover URL indicates missing/invalid cover
 */
function isMissingCover(url: string): boolean {
  if (!url) return true;
  // Common patterns for placeholder/missing covers
  return (
    url.includes('placeholder') ||
    url.includes('default') ||
    url.includes('nocover') ||
    url.endsWith('/cover') ||
    url.length < 10
  );
}

/**
 * Get cached album cover if available
 */
export function getCachedAlbumCover(artist: string, album: string): string | null {
  const key = `${artist.toLowerCase()}|${album.toLowerCase()}`;
  return coverCache.get(key)?.url || null;
}

export interface AlbumCoverResult {
  coverUrl: string;
  isFallback: boolean;
  isLoading: boolean;
  source: SourceInfo | null;
}

/**
 * Hook that provides album cover with multi-source fallback
 * Sources: Cover Art Archive → iTunes → Discogs → TheAudioDB → Last.fm
 */
export function useAlbumCover(
  serverCover: string | undefined,
  artist: string | undefined,
  album: string | undefined,
  trackId?: string
): AlbumCoverResult {
  const placeholder = trackId
    ? `https://picsum.photos/seed/${trackId}/400/400`
    : DEFAULT_PLACEHOLDER;

  const [state, setState] = useState<AlbumCoverResult>(() => {
    // Check if server cover is valid
    if (serverCover && !isMissingCover(serverCover)) {
      return {
        coverUrl: serverCover,
        isFallback: false,
        isLoading: false,
        source: null, // Server cover, no external source
      };
    }

    // Check cache for fallback
    if (artist && album) {
      const cacheKey = `${artist.toLowerCase()}|${album.toLowerCase()}`;
      const cached = coverCache.get(cacheKey);
      if (cached) {
        return {
          coverUrl: cached.url,
          isFallback: true,
          isLoading: false,
          source: cached.source,
        };
      }
    }

    return {
      coverUrl: serverCover || placeholder,
      isFallback: false,
      isLoading: true,
      source: null,
    };
  });

  useEffect(() => {
    // If server cover is valid, use it
    if (serverCover && !isMissingCover(serverCover)) {
      setState({
        coverUrl: serverCover,
        isFallback: false,
        isLoading: false,
        source: null,
      });
      return;
    }

    // Need artist and album for fallback lookup
    if (!artist || !album) {
      setState({
        coverUrl: placeholder,
        isFallback: false,
        isLoading: false,
        source: null,
      });
      return;
    }

    const controller = new AbortController();
    const cacheKey = `${artist.toLowerCase()}|${album.toLowerCase()}`;

    // Check if we know this cover is missing
    if (missingCovers.has(cacheKey)) {
      setState({
        coverUrl: placeholder,
        isFallback: false,
        isLoading: false,
        source: null,
      });
      return;
    }

    // Check cache
    const cached = coverCache.get(cacheKey);
    if (cached) {
      setState({
        coverUrl: cached.url,
        isFallback: true,
        isLoading: false,
        source: cached.source,
      });
      return;
    }

    setState(prev => ({ ...prev, isLoading: true }));

    fetchAlbumCoverAggregated({ title: album, artist }, controller.signal)
      .then(result => {
        if (result?.data?.url) {
          coverCache.set(cacheKey, { url: result.data.url, source: result.source });
          setState({
            coverUrl: result.data.url,
            isFallback: true,
            isLoading: false,
            source: result.source,
          });
        } else {
          missingCovers.add(cacheKey);
          setState({
            coverUrl: placeholder,
            isFallback: false,
            isLoading: false,
            source: null,
          });
        }
      })
      .catch(err => {
        if ((err as Error).name !== 'AbortError') {
          missingCovers.add(cacheKey);
          setState({
            coverUrl: placeholder,
            isFallback: false,
            isLoading: false,
            source: null,
          });
        }
      });

    return () => {
      controller.abort();
    };
  }, [serverCover, artist, album, placeholder]);

  return state;
}

// Re-export for backwards compatibility
export { isMissingCover };
export type { SourceInfo };
