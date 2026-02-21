import { useState, useEffect, useRef } from 'react';
import { Album } from '../types';
import { fetchAlbumYear } from '../utils/albumYear';

const MAX_CONCURRENT = 4;

/**
 * Process an array of async tasks with limited concurrency.
 * Returns results in the same order as the input.
 */
async function batchProcess<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  concurrency: number,
  signal?: AbortSignal
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      if (signal?.aborted) return;
      const i = nextIndex++;
      results[i] = await fn(items[i]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

/**
 * Hook to enrich albums with missing release years
 * Fetches years from iTunes API for albums without year metadata
 * Limits concurrent requests to avoid saturating the network.
 */
export function useEnrichedAlbums(albums: Album[]): Album[] {
  const [enriched, setEnriched] = useState<Album[]>(albums);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    // Abort any in-flight enrichment from previous render
    abortRef.current?.abort();

    const missingYears = albums.filter(a => !a.year);

    // If no albums missing years, just return original
    if (missingYears.length === 0) {
      setEnriched(albums);
      return;
    }

    // Start with current albums while fetching
    setEnriched(albums);

    const controller = new AbortController();
    abortRef.current = controller;

    // Fetch missing years with limited concurrency
    batchProcess(
      missingYears,
      async (album) => {
        const year = await fetchAlbumYear(album.artist, album.title);
        return { id: album.id, year };
      },
      MAX_CONCURRENT,
      controller.signal
    ).then(results => {
      if (controller.signal.aborted) return;
      const yearMap = new Map(
        results.filter(r => r.year).map(r => [r.id, r.year!])
      );

      // Only update if we found any years
      if (yearMap.size > 0) {
        setEnriched(prev => prev.map(a =>
          yearMap.has(a.id) ? { ...a, year: yearMap.get(a.id) } : a
        ));
      }
    });

    return () => { controller.abort(); };
  }, [albums]);

  return enriched;
}
