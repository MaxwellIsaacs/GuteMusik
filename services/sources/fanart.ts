/**
 * Fanart.tv Source Provider
 * Tier 4 - Specialized for high-quality artist artwork
 * https://fanart.tv/
 */

import { rateLimitedFetch, fetchWithTimeout } from '../rateLimit';
import { getArtistMbid } from './musicbrainz';
import {
  SOURCES,
  type ImageData,
  type ArtistQuery,
  type SourcedResult,
} from './types';

// Free personal API key - users can register their own at fanart.tv
const API_KEY = '4f6c5f5c3e8e7f3b8c1d0a9e8b7c6d5e';
const BASE_URL = 'https://webservice.fanart.tv/v3/music';

interface FanartArtist {
  name: string;
  mbid_id: string;
  artistbackground?: FanartImage[];
  artistthumb?: FanartImage[];
  musiclogo?: FanartImage[];
  hdmusiclogo?: FanartImage[];
  musicbanner?: FanartImage[];
  albums?: Record<string, FanartAlbum>;
}

interface FanartAlbum {
  albumcover?: FanartImage[];
  cdart?: FanartImage[];
}

interface FanartImage {
  id: string;
  url: string;
  likes: string;
}

async function fanartFetch<T>(endpoint: string): Promise<T | null> {
  return rateLimitedFetch('fanart', async () => {
    const response = await fetchWithTimeout(`${BASE_URL}${endpoint}?api_key=${API_KEY}`, {
      timeout: 10000,
    });

    if (response.status === 404) return null;
    if (!response.ok) {
      throw new Error(`Fanart.tv API error: ${response.status}`);
    }
    return response.json();
  });
}

/**
 * Get best image from array (sorted by likes)
 */
function getBestImage(images: FanartImage[] | undefined): FanartImage | null {
  if (!images?.length) return null;
  // Sort by likes (descending) and return the most liked
  return [...images].sort((a, b) => parseInt(b.likes) - parseInt(a.likes))[0];
}

/**
 * Fetch artist images from Fanart.tv
 */
export async function fetchArtistImage(
  query: ArtistQuery,
  signal?: AbortSignal
): Promise<SourcedResult<ImageData> | null> {
  try {
    // We need an MBID to query Fanart.tv
    const mbid = query.mbid || (await getArtistMbid(query.name));
    if (!mbid) {
      console.log('[Fanart.tv] No MBID available for artist');
      return null;
    }

    const artist = await fanartFetch<FanartArtist>(`/${mbid}`);
    if (!artist) return null;

    // Priority: thumb > background > logo
    const thumb = getBestImage(artist.artistthumb);
    if (thumb) {
      return {
        data: {
          url: thumb.url,
          type: 'thumb',
        },
        source: SOURCES.FANART,
        fetchedAt: Date.now(),
      };
    }

    const background = getBestImage(artist.artistbackground);
    if (background) {
      return {
        data: {
          url: background.url,
          type: 'fanart',
        },
        source: SOURCES.FANART,
        fetchedAt: Date.now(),
      };
    }

    return null;
  } catch (error) {
    console.error('[Fanart.tv] Artist image fetch error:', error);
    return null;
  }
}

/**
 * Fetch artist background/fanart specifically
 */
export async function fetchArtistBackground(
  query: ArtistQuery,
  signal?: AbortSignal
): Promise<SourcedResult<ImageData> | null> {
  try {
    const mbid = query.mbid || (await getArtistMbid(query.name));
    if (!mbid) return null;

    const artist = await fanartFetch<FanartArtist>(`/${mbid}`);
    if (!artist) return null;

    const background = getBestImage(artist.artistbackground);
    if (!background) return null;

    return {
      data: {
        url: background.url,
        type: 'fanart',
      },
      source: SOURCES.FANART,
      fetchedAt: Date.now(),
    };
  } catch (error) {
    console.error('[Fanart.tv] Background fetch error:', error);
    return null;
  }
}

/**
 * Fetch artist logo
 */
export async function fetchArtistLogo(
  query: ArtistQuery,
  signal?: AbortSignal
): Promise<SourcedResult<ImageData> | null> {
  try {
    const mbid = query.mbid || (await getArtistMbid(query.name));
    if (!mbid) return null;

    const artist = await fanartFetch<FanartArtist>(`/${mbid}`);
    if (!artist) return null;

    // Prefer HD logo
    const logo = getBestImage(artist.hdmusiclogo) || getBestImage(artist.musiclogo);
    if (!logo) return null;

    return {
      data: {
        url: logo.url,
        type: 'logo',
      },
      source: SOURCES.FANART,
      fetchedAt: Date.now(),
    };
  } catch (error) {
    console.error('[Fanart.tv] Logo fetch error:', error);
    return null;
  }
}

/**
 * Fetch album cover from Fanart.tv
 */
export async function fetchAlbumCover(
  artistMbid: string,
  albumMbid: string,
  signal?: AbortSignal
): Promise<SourcedResult<ImageData> | null> {
  try {
    const artist = await fanartFetch<FanartArtist>(`/${artistMbid}`);
    if (!artist?.albums) return null;

    const album = artist.albums[albumMbid];
    if (!album) return null;

    const cover = getBestImage(album.albumcover);
    if (!cover) return null;

    return {
      data: {
        url: cover.url,
        type: 'cover',
      },
      source: SOURCES.FANART,
      fetchedAt: Date.now(),
    };
  } catch (error) {
    console.error('[Fanart.tv] Album cover fetch error:', error);
    return null;
  }
}
