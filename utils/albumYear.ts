// Cache for fetched album years
const yearCache = new Map<string, string>();
const pendingRequests = new Map<string, Promise<string | null>>();

/**
 * Fetch album release year from iTunes Search API
 * Uses caching and request deduplication for efficiency
 */
export async function fetchAlbumYear(artist: string, album: string): Promise<string | null> {
  const cacheKey = `${artist}-${album}`.toLowerCase();

  // Return cached result if available
  if (yearCache.has(cacheKey)) {
    return yearCache.get(cacheKey)!;
  }

  // Return pending request if one exists (deduplication)
  if (pendingRequests.has(cacheKey)) {
    return pendingRequests.get(cacheKey)!;
  }

  const request = (async () => {
    try {
      const query = encodeURIComponent(`${artist} ${album}`);
      const res = await fetch(`https://itunes.apple.com/search?term=${query}&entity=album&limit=1`);
      const data = await res.json();

      if (data.results?.[0]?.releaseDate) {
        const year = new Date(data.results[0].releaseDate).getFullYear().toString();
        yearCache.set(cacheKey, year);
        return year;
      }
      return null;
    } catch {
      return null;
    } finally {
      pendingRequests.delete(cacheKey);
    }
  })();

  pendingRequests.set(cacheKey, request);
  return request;
}
