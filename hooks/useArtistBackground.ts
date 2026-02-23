import { useState, useEffect } from 'react';
import {
  fetchArtistBackground as fetchArtistBackgroundAggregated,
  fetchArtistImage as fetchArtistImageAggregated,
} from '../services/aggregator';
import { ARTIST_PLACEHOLDER } from './useArtistImage';

const bgCache = new Map<string, { url: string; fetchedAt: number }>();
const CACHE_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Hook to fetch high-res artist background images (fanart/widescreen).
 * Falls back to the regular artist image if no background is available.
 */
export function useArtistBackground(artistName: string | undefined): {
  imageUrl: string;
  isLoading: boolean;
} {
  const [imageUrl, setImageUrl] = useState<string>(() => {
    if (!artistName) return ARTIST_PLACEHOLDER;
    const cached = bgCache.get(artistName.toLowerCase());
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) return cached.url;
    return ARTIST_PLACEHOLDER;
  });
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!artistName) {
      setImageUrl(ARTIST_PLACEHOLDER);
      return;
    }

    const cacheKey = artistName.toLowerCase();
    const cached = bgCache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
      setImageUrl(cached.url);
      return;
    }

    const controller = new AbortController();
    setIsLoading(true);

    (async () => {
      try {
        // Try high-res background first
        let result = await fetchArtistBackgroundAggregated({ name: artistName }, controller.signal);

        // Fall back to regular artist image
        if (!result?.data?.url) {
          result = await fetchArtistImageAggregated({ name: artistName }, controller.signal);
        }

        if (!controller.signal.aborted) {
          const url = result?.data?.url || ARTIST_PLACEHOLDER;
          bgCache.set(cacheKey, { url, fetchedAt: Date.now() });
          setImageUrl(url);
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setImageUrl(ARTIST_PLACEHOLDER);
        }
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    })();

    return () => controller.abort();
  }, [artistName]);

  return { imageUrl, isLoading };
}
