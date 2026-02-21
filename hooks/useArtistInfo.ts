import { useState, useEffect } from 'react';
import {
  fetchArtistInfo,
  type ArtistData,
  type SourceInfo,
} from '../services/aggregator';

export interface ArtistInfoResult {
  info: ArtistData | null;
  source: SourceInfo | null;
  isLoading: boolean;
  error: string | null;
}

export function useArtistInfo(artistName: string | undefined): ArtistInfoResult {
  const [info, setInfo] = useState<ArtistData | null>(null);
  const [source, setSource] = useState<SourceInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!artistName) {
      setInfo(null);
      setSource(null);
      return;
    }

    const controller = new AbortController();

    const fetchData = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const result = await fetchArtistInfo(
          { name: artistName },
          controller.signal
        );

        if (result) {
          setInfo(result.data);
          setSource(result.source);
        } else {
          setInfo(null);
          setSource(null);
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          console.error('Failed to fetch artist info:', err);
          setError('Failed to load artist information');
          setInfo(null);
          setSource(null);
        }
      } finally {
        setIsLoading(false);
      }
    };

    // Small delay to debounce rapid changes
    const timeout = setTimeout(fetchData, 100);

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [artistName]);

  return { info, source, isLoading, error };
}

// Re-export types for convenience
export type { ArtistData, SourceInfo } from '../services/aggregator';
