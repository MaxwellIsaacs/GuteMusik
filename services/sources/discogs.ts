/**
 * Discogs Source Provider
 * Tier 1 - Professional, comprehensive database especially for physical releases
 * https://www.discogs.com/developers/
 */

import { rateLimitedFetch, fetchWithTimeout } from '../rateLimit';
import {
  SOURCES,
  USER_AGENT,
  type ArtistData,
  type AlbumData,
  type ImageData,
  type ArtistQuery,
  type AlbumQuery,
  type SourcedResult,
} from './types';

const BASE_URL = 'https://api.discogs.com';

interface DiscogsSearchResult {
  results: DiscogsResult[];
}

interface DiscogsResult {
  id: number;
  type: 'artist' | 'release' | 'master';
  title?: string;
  name?: string;
  thumb?: string;
  cover_image?: string;
}

interface DiscogsArtist {
  id: number;
  name: string;
  profile?: string;
  realname?: string;
  images?: { type: string; uri: string; width: number; height: number }[];
  members?: { id: number; name: string; active: boolean }[];
  groups?: { id: number; name: string; active: boolean }[];
  urls?: string[];
  namevariations?: string[];
}

interface DiscogsRelease {
  id: number;
  title: string;
  year?: number;
  genres?: string[];
  styles?: string[];
  labels?: { name: string; catno: string }[];
  images?: { type: string; uri: string; width: number; height: number }[];
  tracklist?: { position: string; title: string; duration: string }[];
  notes?: string;
  extraartists?: { name: string; role: string }[];
}

async function discogsFetch<T>(endpoint: string): Promise<T> {
  return rateLimitedFetch('discogs', async () => {
    const response = await fetchWithTimeout(`${BASE_URL}${endpoint}`, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/vnd.discogs.v2.discogs+json',
      },
      timeout: 10000,
    });
    if (!response.ok) {
      throw new Error(`Discogs API error: ${response.status}`);
    }
    return response.json();
  });
}

/**
 * Search for an artist
 */
async function searchArtist(name: string): Promise<DiscogsResult | null> {
  const url = `/database/search?q=${encodeURIComponent(name)}&type=artist&per_page=3`;
  const data = await discogsFetch<DiscogsSearchResult>(url);

  // Find best match (prefer exact name match)
  const results = data.results || [];
  return (
    results.find(r => r.title?.toLowerCase() === name.toLowerCase()) ||
    results[0] ||
    null
  );
}

/**
 * Get artist details
 */
async function getArtist(id: number): Promise<DiscogsArtist | null> {
  return discogsFetch<DiscogsArtist>(`/artists/${id}`);
}

/**
 * Search for a release (album)
 */
async function searchRelease(album: string, artist: string): Promise<DiscogsResult | null> {
  const query = `${artist} ${album}`;
  const url = `/database/search?q=${encodeURIComponent(query)}&type=master&per_page=5`;
  const data = await discogsFetch<DiscogsSearchResult>(url);

  const results = data.results || [];
  // Prefer match with album title
  return (
    results.find(r => r.title?.toLowerCase().includes(album.toLowerCase())) ||
    results[0] ||
    null
  );
}

/**
 * Get master release details
 */
async function getMasterRelease(id: number): Promise<DiscogsRelease | null> {
  return discogsFetch<DiscogsRelease>(`/masters/${id}`);
}

/**
 * Parse duration string (e.g., "4:32") to seconds
 */
function parseDuration(duration: string): number | undefined {
  const match = duration.match(/^(\d+):(\d+)$/);
  if (!match) return undefined;
  return parseInt(match[1]) * 60 + parseInt(match[2]);
}

/**
 * Truncate profile to create bio summary
 */
function createBioSummary(profile: string): string {
  const sentences = profile.split(/(?<=[.!?])\s+/);
  return sentences.slice(0, 3).join(' ');
}

/**
 * Fetch artist data from Discogs
 */
export async function fetchArtistData(
  query: ArtistQuery,
  signal?: AbortSignal
): Promise<SourcedResult<ArtistData> | null> {
  try {
    const searchResult = await searchArtist(query.name);
    if (!searchResult) return null;

    const artist = await getArtist(searchResult.id);
    if (!artist) return null;

    const data: ArtistData = {
      bio: artist.profile || undefined,
      bioSummary: artist.profile ? createBioSummary(artist.profile) : undefined,
      members: artist.members?.map(m => ({ name: m.name, active: m.active })),
      links: artist.urls?.map(url => ({ type: 'website', url })),
    };

    return {
      data,
      source: SOURCES.DISCOGS,
      fetchedAt: Date.now(),
    };
  } catch (error) {
    console.error('[Discogs] Artist fetch error:', error);
    return null;
  }
}

/**
 * Fetch album data from Discogs
 */
export async function fetchAlbumData(
  query: AlbumQuery,
  signal?: AbortSignal
): Promise<SourcedResult<AlbumData> | null> {
  try {
    const searchResult = await searchRelease(query.title, query.artist);
    if (!searchResult) return null;

    const release = await getMasterRelease(searchResult.id);
    if (!release) return null;

    const data: AlbumData = {
      description: release.notes || undefined,
      descriptionSummary: release.notes ? createBioSummary(release.notes) : undefined,
      genres: release.genres,
      tags: release.styles,
      releaseDate: release.year?.toString(),
      label: release.labels?.[0]?.name,
      credits: release.extraartists?.map(ea => ({ role: ea.role, name: ea.name })),
      tracklist: release.tracklist?.map((t, i) => ({
        position: parseInt(t.position) || i + 1,
        title: t.title,
        duration: t.duration ? parseDuration(t.duration) : undefined,
      })),
    };

    return {
      data,
      source: SOURCES.DISCOGS,
      fetchedAt: Date.now(),
    };
  } catch (error) {
    console.error('[Discogs] Album fetch error:', error);
    return null;
  }
}

/**
 * Fetch artist image from Discogs
 */
export async function fetchArtistImage(
  query: ArtistQuery,
  signal?: AbortSignal
): Promise<SourcedResult<ImageData> | null> {
  try {
    const searchResult = await searchArtist(query.name);
    if (!searchResult) return null;

    const artist = await getArtist(searchResult.id);
    if (!artist?.images?.length) return null;

    // Prefer primary image
    const image =
      artist.images.find(img => img.type === 'primary') || artist.images[0];

    return {
      data: {
        url: image.uri,
        width: image.width,
        height: image.height,
        type: 'primary',
      },
      source: SOURCES.DISCOGS,
      fetchedAt: Date.now(),
    };
  } catch (error) {
    console.error('[Discogs] Image fetch error:', error);
    return null;
  }
}

/**
 * Fetch album cover from Discogs
 */
export async function fetchAlbumCover(
  query: AlbumQuery,
  signal?: AbortSignal
): Promise<SourcedResult<ImageData> | null> {
  try {
    const searchResult = await searchRelease(query.title, query.artist);
    if (!searchResult) return null;

    const release = await getMasterRelease(searchResult.id);
    if (!release?.images?.length) return null;

    // Prefer primary image
    const image =
      release.images.find(img => img.type === 'primary') || release.images[0];

    return {
      data: {
        url: image.uri,
        width: image.width,
        height: image.height,
        type: 'cover',
      },
      source: SOURCES.DISCOGS,
      fetchedAt: Date.now(),
    };
  } catch (error) {
    console.error('[Discogs] Cover fetch error:', error);
    return null;
  }
}
