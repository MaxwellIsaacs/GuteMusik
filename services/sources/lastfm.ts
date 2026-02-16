/**
 * Last.fm Source Provider
 * Tier 3 - Community-driven with good bio data and similar artists
 * https://www.last.fm/api
 */

import { rateLimitedFetch, fetchWithTimeout } from '../rateLimit';
import {
  SOURCES,
  type ArtistData,
  type AlbumData,
  type ImageData,
  type ArtistQuery,
  type AlbumQuery,
  type SourcedResult,
} from './types';

// Free API key - Last.fm allows embedding in open-source projects
// Users can register their own at https://www.last.fm/api/account/create
const API_KEY = '44d1ad6d4fc78da4f6a10d3ddceada2c';
const BASE_URL = 'https://ws.audioscrobbler.com/2.0/';

interface LastFmResponse {
  artist?: LastFmArtist;
  album?: LastFmAlbum;
  error?: number;
  message?: string;
}

interface LastFmArtist {
  name: string;
  mbid?: string;
  url: string;
  image?: LastFmImage[];
  bio?: {
    summary: string;
    content: string;
  };
  tags?: {
    tag: { name: string; url: string }[];
  };
  similar?: {
    artist: { name: string; url: string; image?: LastFmImage[] }[];
  };
  stats?: {
    listeners: string;
    playcount: string;
  };
}

interface LastFmAlbum {
  name: string;
  artist: string;
  mbid?: string;
  url: string;
  image?: LastFmImage[];
  tags?: {
    tag: { name: string; url: string }[];
  };
  wiki?: {
    summary: string;
    content: string;
  };
  tracks?: {
    track: { name: string; duration: string; '@attr': { rank: string } }[];
  };
}

interface LastFmImage {
  '#text': string;
  size: 'small' | 'medium' | 'large' | 'extralarge' | 'mega';
}

async function lastfmFetch<T>(params: Record<string, string>): Promise<T> {
  const searchParams = new URLSearchParams({
    ...params,
    api_key: API_KEY,
    format: 'json',
  });

  return rateLimitedFetch('lastfm', async () => {
    const response = await fetchWithTimeout(`${BASE_URL}?${searchParams}`, {
      timeout: 8000,
    });
    if (!response.ok) {
      throw new Error(`Last.fm API error: ${response.status}`);
    }
    return response.json();
  });
}

/**
 * Get the best available image from Last.fm images array
 */
function getBestImage(images: LastFmImage[] | undefined): string | null {
  if (!images?.length) return null;

  // Prefer larger sizes
  const sizeOrder = ['mega', 'extralarge', 'large', 'medium', 'small'];
  for (const size of sizeOrder) {
    const img = images.find(i => i.size === size && i['#text']);
    if (img) return img['#text'];
  }

  return images[0]?.['#text'] || null;
}

/**
 * Strip HTML tags from Last.fm bio text
 */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/Read more on Last\.fm.*$/gi, '')
    .trim();
}

/**
 * Fetch artist info from Last.fm
 */
export async function fetchArtistData(
  query: ArtistQuery,
  signal?: AbortSignal
): Promise<SourcedResult<ArtistData> | null> {
  try {
    const response = await lastfmFetch<LastFmResponse>({
      method: 'artist.getinfo',
      artist: query.name,
      autocorrect: '1',
    });

    const artist = response.artist;
    if (!artist) return null;

    const bio = artist.bio?.content ? stripHtml(artist.bio.content) : undefined;
    const bioSummary = artist.bio?.summary ? stripHtml(artist.bio.summary) : undefined;

    const data: ArtistData = {
      bio,
      bioSummary,
      mbid: artist.mbid,
      tags: artist.tags?.tag?.map(t => t.name) || [],
      similarArtists: artist.similar?.artist?.map(a => ({
        name: a.name,
      })) || [],
      links: [{ type: 'lastfm', url: artist.url }],
    };

    return {
      data,
      source: SOURCES.LASTFM,
      fetchedAt: Date.now(),
    };
  } catch (error) {
    console.error('[Last.fm] Artist fetch error:', error);
    return null;
  }
}

/**
 * Fetch album info from Last.fm
 */
export async function fetchAlbumData(
  query: AlbumQuery,
  signal?: AbortSignal
): Promise<SourcedResult<AlbumData> | null> {
  try {
    const response = await lastfmFetch<LastFmResponse>({
      method: 'album.getinfo',
      artist: query.artist,
      album: query.title,
      autocorrect: '1',
    });

    const album = response.album;
    if (!album) return null;

    const description = album.wiki?.content ? stripHtml(album.wiki.content) : undefined;
    const descriptionSummary = album.wiki?.summary
      ? stripHtml(album.wiki.summary)
      : undefined;

    const data: AlbumData = {
      description,
      descriptionSummary,
      mbid: album.mbid,
      tags: album.tags?.tag?.map(t => t.name) || [],
      tracklist: album.tracks?.track?.map(t => ({
        position: parseInt(t['@attr']?.rank) || 0,
        title: t.name,
        duration: parseInt(t.duration) || undefined,
      })),
    };

    return {
      data,
      source: SOURCES.LASTFM,
      fetchedAt: Date.now(),
    };
  } catch (error) {
    console.error('[Last.fm] Album fetch error:', error);
    return null;
  }
}

/**
 * Fetch artist image from Last.fm
 */
export async function fetchArtistImage(
  query: ArtistQuery,
  signal?: AbortSignal
): Promise<SourcedResult<ImageData> | null> {
  try {
    const response = await lastfmFetch<LastFmResponse>({
      method: 'artist.getinfo',
      artist: query.name,
      autocorrect: '1',
    });

    const imageUrl = getBestImage(response.artist?.image);
    if (!imageUrl) return null;

    return {
      data: {
        url: imageUrl,
        type: 'primary',
      },
      source: SOURCES.LASTFM,
      fetchedAt: Date.now(),
    };
  } catch (error) {
    console.error('[Last.fm] Image fetch error:', error);
    return null;
  }
}

/**
 * Fetch album cover from Last.fm
 */
export async function fetchAlbumCover(
  query: AlbumQuery,
  signal?: AbortSignal
): Promise<SourcedResult<ImageData> | null> {
  try {
    const response = await lastfmFetch<LastFmResponse>({
      method: 'album.getinfo',
      artist: query.artist,
      album: query.title,
      autocorrect: '1',
    });

    const imageUrl = getBestImage(response.album?.image);
    if (!imageUrl) return null;

    return {
      data: {
        url: imageUrl,
        type: 'cover',
      },
      source: SOURCES.LASTFM,
      fetchedAt: Date.now(),
    };
  } catch (error) {
    console.error('[Last.fm] Cover fetch error:', error);
    return null;
  }
}

/**
 * Fetch similar artists from Last.fm
 */
export async function fetchSimilarArtists(
  artistName: string,
  limit: number = 10,
  signal?: AbortSignal
): Promise<{ name: string }[]> {
  try {
    const response = await lastfmFetch<{
      similarartists?: { artist: { name: string }[] };
    }>({
      method: 'artist.getsimilar',
      artist: artistName,
      limit: limit.toString(),
      autocorrect: '1',
    });

    return (
      response.similarartists?.artist?.map(a => ({ name: a.name })) || []
    );
  } catch (error) {
    console.error('[Last.fm] Similar artists fetch error:', error);
    return [];
  }
}
