/**
 * iTunes Search Source Provider
 * Tier 2 - Commercial quality metadata from Apple Music catalog
 * https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/
 */

import { rateLimitedFetch, fetchWithTimeout } from '../rateLimit';
import {
  SOURCES,
  type ImageData,
  type AlbumQuery,
  type SourcedResult,
} from './types';

const BASE_URL = 'https://itunes.apple.com';

interface ITunesSearchResult {
  resultCount: number;
  results: ITunesResult[];
}

interface ITunesResult {
  wrapperType: 'collection' | 'track' | 'artist';
  collectionType?: string;
  artistId?: number;
  collectionId?: number;
  artistName: string;
  collectionName?: string;
  artworkUrl30?: string;
  artworkUrl60?: string;
  artworkUrl100?: string;
  releaseDate?: string;
  primaryGenreName?: string;
  trackCount?: number;
}

/**
 * Get high-resolution artwork URL (replace 100x100 with desired size)
 */
function getHighResArtwork(url: string, size: number = 600): string {
  return url.replace('100x100', `${size}x${size}`);
}

/**
 * Normalize strings for comparison
 */
function normalize(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Search iTunes for albums
 */
async function searchAlbums(
  query: string,
  limit: number = 10
): Promise<ITunesResult[]> {
  return rateLimitedFetch('itunes', async () => {
    const url = `${BASE_URL}/search?term=${encodeURIComponent(query)}&entity=album&limit=${limit}`;
    const response = await fetchWithTimeout(url, { timeout: 8000 });

    if (!response.ok) {
      throw new Error(`iTunes API error: ${response.status}`);
    }

    const data: ITunesSearchResult = await response.json();
    return data.results || [];
  });
}

/**
 * Find best matching album from search results
 */
function findBestMatch(
  results: ITunesResult[],
  albumTitle: string,
  artistName: string
): ITunesResult | null {
  if (!results.length) return null;

  const normalizedAlbum = normalize(albumTitle);
  const normalizedArtist = normalize(artistName);

  // Score each result
  const scored = results.map(result => {
    let score = 0;
    const resultAlbum = normalize(result.collectionName || '');
    const resultArtist = normalize(result.artistName || '');

    // Exact album match
    if (resultAlbum === normalizedAlbum) score += 10;
    // Album contains search term
    else if (resultAlbum.includes(normalizedAlbum)) score += 5;
    // Search term contains album
    else if (normalizedAlbum.includes(resultAlbum)) score += 3;

    // Exact artist match
    if (resultArtist === normalizedArtist) score += 10;
    // Artist contains search term
    else if (resultArtist.includes(normalizedArtist)) score += 5;
    // Search term contains artist
    else if (normalizedArtist.includes(resultArtist)) score += 3;

    return { result, score };
  });

  // Sort by score and return best match
  scored.sort((a, b) => b.score - a.score);

  // Only return if score is reasonable
  if (scored[0].score >= 10) {
    return scored[0].result;
  }

  // Fallback to first result if search was reasonable
  return results[0];
}

/**
 * Fetch album cover from iTunes
 */
export async function fetchAlbumCover(
  query: AlbumQuery,
  signal?: AbortSignal
): Promise<SourcedResult<ImageData> | null> {
  try {
    const searchQuery = `${query.artist} ${query.title}`;
    const results = await searchAlbums(searchQuery);

    const match = findBestMatch(results, query.title, query.artist);
    if (!match?.artworkUrl100) return null;

    const url = getHighResArtwork(match.artworkUrl100, 600);

    return {
      data: {
        url,
        width: 600,
        height: 600,
        type: 'cover',
      },
      source: SOURCES.ITUNES,
      fetchedAt: Date.now(),
    };
  } catch (error) {
    console.error('[iTunes] Cover fetch error:', error);
    return null;
  }
}

/**
 * Fetch high-resolution album cover (1200px)
 */
export async function fetchAlbumCoverHiRes(
  query: AlbumQuery,
  signal?: AbortSignal
): Promise<SourcedResult<ImageData> | null> {
  try {
    const searchQuery = `${query.artist} ${query.title}`;
    const results = await searchAlbums(searchQuery);

    const match = findBestMatch(results, query.title, query.artist);
    if (!match?.artworkUrl100) return null;

    const url = getHighResArtwork(match.artworkUrl100, 1200);

    return {
      data: {
        url,
        width: 1200,
        height: 1200,
        type: 'cover',
      },
      source: SOURCES.ITUNES,
      fetchedAt: Date.now(),
    };
  } catch (error) {
    console.error('[iTunes] HiRes cover fetch error:', error);
    return null;
  }
}

/**
 * Search for artist artwork (from their albums)
 */
export async function fetchArtistImage(
  artistName: string,
  signal?: AbortSignal
): Promise<SourcedResult<ImageData> | null> {
  try {
    const results = await searchAlbums(artistName, 5);

    // Find an album by this artist
    const match = results.find(
      r => normalize(r.artistName) === normalize(artistName)
    );

    if (!match?.artworkUrl100) return null;

    const url = getHighResArtwork(match.artworkUrl100, 600);

    return {
      data: {
        url,
        width: 600,
        height: 600,
        type: 'cover', // It's album art, but used for artist
      },
      source: SOURCES.ITUNES,
      fetchedAt: Date.now(),
    };
  } catch (error) {
    console.error('[iTunes] Artist image fetch error:', error);
    return null;
  }
}
