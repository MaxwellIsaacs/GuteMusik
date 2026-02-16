// Album cover fetching utility using iTunes Search API (free, CORS-friendly)

const coverCache = new Map<string, string>();
const pendingRequests = new Map<string, Promise<string | null>>();

/**
 * Fetches album cover from iTunes Search API
 * @param artist - Artist name
 * @param album - Album name
 * @returns Promise<string | null> - URL of the album cover or null if not found
 */
export async function fetchAlbumCover(artist: string, album: string): Promise<string | null> {
  if (!artist || !album) {
    return null;
  }

  const cacheKey = `${artist.toLowerCase().trim()}::${album.toLowerCase().trim()}`;

  // Check cache first
  if (coverCache.has(cacheKey)) {
    return coverCache.get(cacheKey) || null;
  }

  // Check if there's already a pending request
  if (pendingRequests.has(cacheKey)) {
    return pendingRequests.get(cacheKey)!;
  }

  // Create new request
  const requestPromise = (async () => {
    try {
      const searchTerm = encodeURIComponent(`${artist} ${album}`.trim());

      const response = await fetch(
        `https://itunes.apple.com/search?term=${searchTerm}&entity=album&limit=3`,
        { signal: AbortSignal.timeout(5000) }
      );

      if (!response.ok) {
        throw new Error(`iTunes API error: ${response.status}`);
      }

      const data = await response.json();

      if (data.results && data.results.length > 0) {
        // Try to find best match by comparing artist/album names
        const artistLower = artist.toLowerCase();
        const albumLower = album.toLowerCase();

        let bestMatch = data.results[0];
        for (const result of data.results) {
          const resultArtist = (result.artistName || '').toLowerCase();
          const resultAlbum = (result.collectionName || '').toLowerCase();

          if (resultArtist.includes(artistLower) || artistLower.includes(resultArtist)) {
            if (resultAlbum.includes(albumLower) || albumLower.includes(resultAlbum)) {
              bestMatch = result;
              break;
            }
          }
        }

        if (bestMatch.artworkUrl100) {
          // Get higher resolution by replacing 100x100 with 600x600
          const imageUrl = bestMatch.artworkUrl100.replace('100x100', '600x600');
          coverCache.set(cacheKey, imageUrl);
          return imageUrl;
        }
      }

      // No results found
      coverCache.set(cacheKey, '');
      return null;
    } catch (error) {
      console.warn(`Failed to fetch album cover for "${artist} - ${album}":`, error);
      coverCache.set(cacheKey, '');
      return null;
    } finally {
      pendingRequests.delete(cacheKey);
    }
  })();

  pendingRequests.set(cacheKey, requestPromise);
  return requestPromise;
}

/**
 * Get cached album cover if available
 */
export function getCachedAlbumCover(artist: string, album: string): string | null {
  const cacheKey = `${artist.toLowerCase().trim()}::${album.toLowerCase().trim()}`;
  const cached = coverCache.get(cacheKey);
  return cached || null;
}

/**
 * Check if a cover URL is a placeholder or missing
 */
export function isMissingCover(coverUrl: string | undefined): boolean {
  if (!coverUrl) return true;
  // Check for common placeholder patterns
  return coverUrl.includes('picsum.photos') ||
         coverUrl.includes('placeholder') ||
         coverUrl.includes('data:image/svg');
}
