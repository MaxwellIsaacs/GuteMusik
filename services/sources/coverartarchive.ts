/**
 * Cover Art Archive Source Provider
 * Tier 1 - Professional, high-quality album artwork
 * Hosted by Internet Archive in partnership with MusicBrainz
 * https://coverartarchive.org/
 */

import { rateLimitedFetch, fetchWithTimeout } from '../rateLimit';
import { getAlbumMbid } from './musicbrainz';
import {
  SOURCES,
  type ImageData,
  type AlbumQuery,
  type SourcedResult,
} from './types';

const BASE_URL = 'https://coverartarchive.org';

interface CAAResponse {
  images: CAAImage[];
  release: string;
}

interface CAAImage {
  id: number;
  front: boolean;
  back: boolean;
  comment?: string;
  image: string;
  thumbnails: {
    small?: string;
    large?: string;
    '250'?: string;
    '500'?: string;
    '1200'?: string;
  };
}

/**
 * Fetch cover art from Cover Art Archive by MBID
 */
async function fetchByMbid(mbid: string): Promise<CAAResponse | null> {
  return rateLimitedFetch('coverartarchive', async () => {
    const response = await fetchWithTimeout(`${BASE_URL}/release-group/${mbid}`, {
      timeout: 10000,
      headers: {
        'Accept': 'application/json',
      },
    });

    if (response.status === 404) {
      // Try release instead of release-group
      const releaseResponse = await fetchWithTimeout(`${BASE_URL}/release/${mbid}`, {
        timeout: 10000,
        headers: {
          'Accept': 'application/json',
        },
      });
      if (!releaseResponse.ok) return null;
      return releaseResponse.json();
    }

    if (!response.ok) return null;
    return response.json();
  });
}

/**
 * Get the best image from CAA response
 */
function getBestImage(images: CAAImage[]): CAAImage | null {
  if (!images?.length) return null;

  // Prefer front cover
  const frontCover = images.find(img => img.front);
  if (frontCover) return frontCover;

  return images[0];
}

/**
 * Fetch album cover from Cover Art Archive
 */
export async function fetchAlbumCover(
  query: AlbumQuery,
  signal?: AbortSignal
): Promise<SourcedResult<ImageData> | null> {
  try {
    // We need an MBID to query CAA
    const mbid = query.mbid || (await getAlbumMbid(query.title, query.artist));
    if (!mbid) {
      console.log('[CAA] No MBID available for album');
      return null;
    }

    const response = await fetchByMbid(mbid);
    if (!response) return null;

    const bestImage = getBestImage(response.images);
    if (!bestImage) return null;

    // Prefer 500px thumbnail for good quality without being too large
    const url =
      bestImage.thumbnails['500'] ||
      bestImage.thumbnails['1200'] ||
      bestImage.thumbnails.large ||
      bestImage.image;

    return {
      data: {
        url,
        type: 'cover',
        width: 500, // Approximate
        height: 500,
      },
      source: SOURCES.COVER_ART_ARCHIVE,
      fetchedAt: Date.now(),
    };
  } catch (error) {
    console.error('[CAA] Cover fetch error:', error);
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
    const mbid = query.mbid || (await getAlbumMbid(query.title, query.artist));
    if (!mbid) return null;

    const response = await fetchByMbid(mbid);
    if (!response) return null;

    const bestImage = getBestImage(response.images);
    if (!bestImage) return null;

    // Get highest resolution available
    const url =
      bestImage.thumbnails['1200'] ||
      bestImage.image;

    return {
      data: {
        url,
        type: 'cover',
        width: 1200,
        height: 1200,
      },
      source: SOURCES.COVER_ART_ARCHIVE,
      fetchedAt: Date.now(),
    };
  } catch (error) {
    console.error('[CAA] HiRes cover fetch error:', error);
    return null;
  }
}

/**
 * Get direct URL to album cover (useful for img src)
 * This is a redirect URL that doesn't require fetching metadata first
 */
export function getDirectCoverUrl(mbid: string, size: 250 | 500 | 1200 = 500): string {
  return `${BASE_URL}/release-group/${mbid}/front-${size}`;
}
