// Artist image fetching utility using TheAudioDB (free, has actual artist photos)

const imageCache = new Map<string, string>();
const pendingRequests = new Map<string, Promise<string>>();

// SVG placeholder for unknown artists (anonymous silhouette)
export const ARTIST_PLACEHOLDER = `data:image/svg+xml,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" fill="none">
  <rect width="400" height="400" fill="#1a1a1a"/>
  <circle cx="200" cy="140" r="60" fill="#333"/>
  <ellipse cx="200" cy="320" rx="100" ry="80" fill="#333"/>
</svg>
`)}`;

interface AudioDBArtist {
  idArtist: string;
  strArtist: string;
  strArtistThumb: string | null;
  strArtistFanart: string | null;
  strArtistFanart2: string | null;
  strArtistFanart3: string | null;
  strArtistCutout: string | null;
}

interface AudioDBResponse {
  artists: AudioDBArtist[] | null;
}

/**
 * Fetches an artist image from TheAudioDB
 * @param artistName - The name of the artist to search for
 * @returns Promise<string> - URL of the artist image or placeholder
 */
export async function fetchArtistImage(artistName: string): Promise<string> {
  if (!artistName || artistName.trim() === '') {
    return ARTIST_PLACEHOLDER;
  }

  const cacheKey = artistName.toLowerCase().trim();

  // Check cache first
  if (imageCache.has(cacheKey)) {
    return imageCache.get(cacheKey)!;
  }

  // Check if there's already a pending request for this artist
  if (pendingRequests.has(cacheKey)) {
    return pendingRequests.get(cacheKey)!;
  }

  // Create new request
  const requestPromise = (async () => {
    try {
      const encodedName = encodeURIComponent(artistName.trim());

      // TheAudioDB free endpoint (API key "2" is the free/demo key)
      const response = await fetch(
        `https://www.theaudiodb.com/api/v1/json/2/search.php?s=${encodedName}`,
        { signal: AbortSignal.timeout(5000) }
      );

      if (!response.ok) {
        throw new Error(`TheAudioDB API error: ${response.status}`);
      }

      const data: AudioDBResponse = await response.json();

      if (data.artists && data.artists.length > 0) {
        const artist = data.artists[0];
        // Prefer thumb, then fanart, then cutout
        const imageUrl =
          artist.strArtistThumb ||
          artist.strArtistFanart ||
          artist.strArtistFanart2 ||
          artist.strArtistFanart3 ||
          artist.strArtistCutout;

        if (imageUrl) {
          imageCache.set(cacheKey, imageUrl);
          return imageUrl;
        }
      }

      // No results found
      imageCache.set(cacheKey, ARTIST_PLACEHOLDER);
      return ARTIST_PLACEHOLDER;
    } catch (error) {
      console.warn(`Failed to fetch artist image for "${artistName}":`, error);
      // Cache the placeholder to avoid repeated failed requests
      imageCache.set(cacheKey, ARTIST_PLACEHOLDER);
      return ARTIST_PLACEHOLDER;
    } finally {
      pendingRequests.delete(cacheKey);
    }
  })();

  pendingRequests.set(cacheKey, requestPromise);
  return requestPromise;
}

/**
 * Prefetch images for multiple artists
 * @param artistNames - Array of artist names to prefetch
 */
export function prefetchArtistImages(artistNames: string[]): void {
  artistNames.forEach(name => {
    if (name && !imageCache.has(name.toLowerCase().trim())) {
      fetchArtistImage(name);
    }
  });
}

/**
 * Clear the image cache (useful for memory management)
 */
export function clearArtistImageCache(): void {
  imageCache.clear();
}

/**
 * Get cached image URL if available, otherwise return placeholder
 * @param artistName - The artist name to look up
 * @returns The cached URL or placeholder
 */
export function getCachedArtistImage(artistName: string): string {
  const cacheKey = artistName.toLowerCase().trim();
  return imageCache.get(cacheKey) || ARTIST_PLACEHOLDER;
}
