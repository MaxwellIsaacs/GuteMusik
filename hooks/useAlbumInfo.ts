import { useState, useEffect } from 'react';
import {
  fetchAlbumInfo,
  type AlbumData,
  type SourceInfo,
} from '../services/aggregator';

export interface AlbumInfoResult {
  info: AlbumData | null;
  source: SourceInfo | null;
  isLoading: boolean;
}

export function useAlbumInfo(
  artistName: string | undefined,
  albumTitle: string | undefined
): AlbumInfoResult {
  const [info, setInfo] = useState<AlbumData | null>(null);
  const [source, setSource] = useState<SourceInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!artistName || !albumTitle) {
      setInfo(null);
      setSource(null);
      return;
    }

    const controller = new AbortController();

    const fetchData = async () => {
      setIsLoading(true);

      try {
        const result = await fetchAlbumInfo(
          { title: albumTitle, artist: artistName },
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
          console.error('Failed to fetch album info:', err);
          setInfo(null);
          setSource(null);
        }
      } finally {
        setIsLoading(false);
      }
    };

    // Small delay to debounce
    const timeout = setTimeout(fetchData, 100);

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [artistName, albumTitle]);

  return { info, source, isLoading };
}

// Batch hook for loading multiple albums
export function useAlbumInfoBatch(
  artistName: string | undefined,
  albums: { id: string; title: string }[]
) {
  const [infoMap, setInfoMap] = useState<Record<string, AlbumData | null>>({});
  const [sourceMap, setSourceMap] = useState<Record<string, SourceInfo | null>>({});
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!artistName || albums.length === 0) {
      setInfoMap({});
      setSourceMap({});
      return;
    }

    const controller = new AbortController();
    const timeoutIds: ReturnType<typeof setTimeout>[] = [];

    // Load albums progressively with staggering
    albums.forEach((album, index) => {
      const tid = setTimeout(async () => {
        if (controller.signal.aborted) return;
        setLoadingIds(prev => new Set(prev).add(album.id));

        try {
          const result = await fetchAlbumInfo(
            { title: album.title, artist: artistName },
            controller.signal
          );

          if (controller.signal.aborted) return;
          if (result) {
            setInfoMap(prev => ({ ...prev, [album.id]: result.data }));
            setSourceMap(prev => ({ ...prev, [album.id]: result.source }));
          } else {
            setInfoMap(prev => ({ ...prev, [album.id]: null }));
            setSourceMap(prev => ({ ...prev, [album.id]: null }));
          }
        } catch (err) {
          if ((err as Error).name === 'AbortError') return;
          console.error('Failed to fetch album info:', err);
          setInfoMap(prev => ({ ...prev, [album.id]: null }));
          setSourceMap(prev => ({ ...prev, [album.id]: null }));
        } finally {
          if (!controller.signal.aborted) {
            setLoadingIds(prev => {
              const next = new Set(prev);
              next.delete(album.id);
              return next;
            });
          }
        }
      }, index * 200); // Stagger requests
      timeoutIds.push(tid);
    });

    return () => {
      timeoutIds.forEach(clearTimeout);
      controller.abort();
    };
  }, [artistName, albums]);

  return { infoMap, sourceMap, loadingIds };
}

// Re-export types
export type { AlbumData, SourceInfo } from '../services/aggregator';
