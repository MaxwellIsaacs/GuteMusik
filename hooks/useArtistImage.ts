import { useState, useEffect } from 'react';
import {
  fetchArtistImage as fetchArtistImageAggregated,
  type SourceInfo,
  type ImageData,
} from '../services/aggregator';

// SVG placeholder for artists with no image
export const ARTIST_PLACEHOLDER = `data:image/svg+xml,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none">
  <rect width="100" height="100" fill="#1a1a2e"/>
  <circle cx="50" cy="35" r="18" fill="#333"/>
  <ellipse cx="50" cy="85" rx="30" ry="25" fill="#333"/>
</svg>
`)}`;

const STORAGE_KEY = 'lumina_artist_images';
const CACHE_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days

interface PersistedEntry {
  url: string;
  sourceName: string | null;
  fetchedAt: number;
}

// Local cache for quick access
const imageCache = new Map<string, { url: string; source: SourceInfo | null; fetchedAt: number }>();

// Load persisted cache from localStorage on module init
function loadPersistedCache() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const entries: Record<string, PersistedEntry> = JSON.parse(raw);
    const now = Date.now();
    for (const [key, entry] of Object.entries(entries)) {
      if (now - entry.fetchedAt < CACHE_TTL && entry.url !== ARTIST_PLACEHOLDER) {
        imageCache.set(key, {
          url: entry.url,
          source: entry.sourceName ? { name: entry.sourceName, tier: 3 } : null,
          fetchedAt: entry.fetchedAt,
        });
      }
    }
  } catch {
    // Corrupted data — ignore and start fresh
  }
}

loadPersistedCache();

// Persist the in-memory cache to localStorage (debounced to avoid
// serializing the entire cache on every single fetch)
let persistTimer: ReturnType<typeof setTimeout> | null = null;
function persistCache() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    try {
      const entries: Record<string, PersistedEntry> = {};
      for (const [key, entry] of imageCache.entries()) {
        if (entry.url !== ARTIST_PLACEHOLDER) {
          entries[key] = {
            url: entry.url,
            sourceName: entry.source?.name || null,
            fetchedAt: entry.fetchedAt,
          };
        }
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch {
      // localStorage full or unavailable — silently ignore
    }
  }, 2000);
}

/**
 * Get cached artist image if available
 */
export function getCachedArtistImage(artistName: string): string {
  const cached = imageCache.get(artistName.toLowerCase());
  if (cached && cached.url !== ARTIST_PLACEHOLDER) {
    if (Date.now() - cached.fetchedAt < CACHE_TTL) {
      return cached.url;
    }
    // Expired — evict
    imageCache.delete(artistName.toLowerCase());
  }
  return ARTIST_PLACEHOLDER;
}

export interface ArtistImageResult {
  imageUrl: string;
  source: SourceInfo | null;
  isLoading: boolean;
  error: string | null;
}

/**
 * Hook to fetch and cache artist images from multiple sources
 * Sources: TheAudioDB → Fanart.tv → Discogs → Last.fm
 * Results are persisted to localStorage for instant loads on restart.
 */
export function useArtistImage(artistName: string | undefined): ArtistImageResult {
  const [imageUrl, setImageUrl] = useState<string>(() => {
    if (!artistName) return ARTIST_PLACEHOLDER;
    return getCachedArtistImage(artistName);
  });
  const [source, setSource] = useState<SourceInfo | null>(() => {
    if (!artistName) return null;
    return imageCache.get(artistName.toLowerCase())?.source || null;
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!artistName) {
      setImageUrl(ARTIST_PLACEHOLDER);
      setSource(null);
      return;
    }

    const controller = new AbortController();
    const cacheKey = artistName.toLowerCase();

    // Check if we already have a cached image that's not the placeholder
    const cached = imageCache.get(cacheKey);
    if (cached && cached.url !== ARTIST_PLACEHOLDER && Date.now() - cached.fetchedAt < CACHE_TTL) {
      setImageUrl(cached.url);
      setSource(cached.source);
      return;
    }

    setIsLoading(true);
    setError(null);

    fetchArtistImageAggregated({ name: artistName }, controller.signal)
      .then(result => {
        const now = Date.now();
        if (result?.data?.url) {
          imageCache.set(cacheKey, { url: result.data.url, source: result.source, fetchedAt: now });
          setImageUrl(result.data.url);
          setSource(result.source);
        } else {
          imageCache.set(cacheKey, { url: ARTIST_PLACEHOLDER, source: null, fetchedAt: now });
          setImageUrl(ARTIST_PLACEHOLDER);
          setSource(null);
        }
        persistCache();
      })
      .catch(err => {
        if ((err as Error).name !== 'AbortError') {
          setError(err.message);
          setImageUrl(ARTIST_PLACEHOLDER);
          setSource(null);
        }
      })
      .finally(() => {
        setIsLoading(false);
      });

    return () => {
      controller.abort();
    };
  }, [artistName]);

  return { imageUrl, source, isLoading, error };
}

// Re-export for backwards compatibility
export type { SourceInfo };
