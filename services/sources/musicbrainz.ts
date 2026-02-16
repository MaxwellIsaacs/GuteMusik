/**
 * MusicBrainz Source Provider
 * Tier 1 - Professional, community-verified metadata
 * https://musicbrainz.org/doc/MusicBrainz_API
 */

import { rateLimitedFetch, fetchWithTimeout } from '../rateLimit';
import {
  SOURCES,
  USER_AGENT,
  type ArtistData,
  type AlbumData,
  type ArtistQuery,
  type AlbumQuery,
  type SourcedResult,
} from './types';

const BASE_URL = 'https://musicbrainz.org/ws/2';

interface MBSearchResult {
  artists?: MBArtist[];
  'release-groups'?: MBReleaseGroup[];
}

interface MBArtist {
  id: string;
  name: string;
  type?: string;
  area?: { name: string };
  'life-span'?: { begin?: string; end?: string; ended?: boolean };
  tags?: { name: string; count: number }[];
  disambiguation?: string;
  relations?: MBRelation[];
}

interface MBReleaseGroup {
  id: string;
  title: string;
  'primary-type'?: string;
  'first-release-date'?: string;
  tags?: { name: string; count: number }[];
  relations?: MBRelation[];
}

interface MBRelation {
  type: string;
  url?: { resource: string };
  target?: string;
}

async function mbFetch<T>(endpoint: string): Promise<T> {
  return rateLimitedFetch('musicbrainz', async () => {
    const response = await fetchWithTimeout(`${BASE_URL}${endpoint}`, {
      headers: { 'User-Agent': USER_AGENT },
      timeout: 10000,
    });
    if (!response.ok) {
      throw new Error(`MusicBrainz API error: ${response.status}`);
    }
    return response.json();
  });
}

/**
 * Search for an artist by name
 */
export async function searchArtist(name: string): Promise<MBArtist | null> {
  const url = `/artist/?query=artist:${encodeURIComponent(name)}&fmt=json&limit=1`;
  const data = await mbFetch<MBSearchResult>(url);
  return data.artists?.[0] || null;
}

/**
 * Get detailed artist info including relations
 */
export async function getArtistDetails(mbid: string): Promise<MBArtist | null> {
  const url = `/artist/${mbid}?inc=tags+url-rels&fmt=json`;
  return mbFetch<MBArtist>(url);
}

/**
 * Search for a release group (album)
 */
export async function searchReleaseGroup(
  album: string,
  artist: string
): Promise<MBReleaseGroup | null> {
  const query = `releasegroup:"${encodeURIComponent(album)}" AND artist:"${encodeURIComponent(artist)}"`;
  const url = `/release-group/?query=${query}&fmt=json&limit=5`;
  const data = await mbFetch<MBSearchResult>(url);

  // Prefer exact title match
  const groups = data['release-groups'] || [];
  return (
    groups.find(rg => rg.title.toLowerCase() === album.toLowerCase()) ||
    groups[0] ||
    null
  );
}

/**
 * Get detailed release group info
 */
export async function getReleaseGroupDetails(mbid: string): Promise<MBReleaseGroup | null> {
  const url = `/release-group/${mbid}?inc=tags+url-rels&fmt=json`;
  return mbFetch<MBReleaseGroup>(url);
}

/**
 * Extract Wikipedia URL from MusicBrainz relations
 */
export function extractWikipediaUrl(relations: MBRelation[] | undefined): string | null {
  if (!relations) return null;
  const wikiRel = relations.find(r => r.type === 'wikipedia' || r.type === 'wikidata');
  return wikiRel?.url?.resource || null;
}

/**
 * Fetch artist data from MusicBrainz
 */
export async function fetchArtistData(
  query: ArtistQuery,
  signal?: AbortSignal
): Promise<SourcedResult<ArtistData> | null> {
  try {
    // Search for artist
    const searchResult = await searchArtist(query.name);
    if (!searchResult) return null;

    // Get detailed info
    const detail = await getArtistDetails(searchResult.id);
    if (!detail) return null;

    const data: ArtistData = {
      mbid: detail.id,
      type: detail.type,
      origin: detail.area?.name,
      formed: detail['life-span']?.begin,
      disbanded: detail['life-span']?.ended ? detail['life-span']?.end : undefined,
      tags: detail.tags?.slice(0, 6).map(t => t.name) || [],
      bio: detail.disambiguation || undefined,
      bioSummary: detail.disambiguation || undefined,
      links: detail.relations
        ?.filter(r => r.url?.resource)
        .map(r => ({ type: r.type, url: r.url!.resource })),
    };

    return {
      data,
      source: SOURCES.MUSICBRAINZ,
      fetchedAt: Date.now(),
    };
  } catch (error) {
    console.error('[MusicBrainz] Artist fetch error:', error);
    return null;
  }
}

/**
 * Fetch album data from MusicBrainz
 */
export async function fetchAlbumData(
  query: AlbumQuery,
  signal?: AbortSignal
): Promise<SourcedResult<AlbumData> | null> {
  try {
    // Search for release group
    const searchResult = await searchReleaseGroup(query.title, query.artist);
    if (!searchResult) return null;

    // Get detailed info
    const detail = await getReleaseGroupDetails(searchResult.id);
    if (!detail) return null;

    const data: AlbumData = {
      mbid: detail.id,
      releaseType: detail['primary-type'] || 'Album',
      releaseDate: detail['first-release-date'],
      genres: detail.tags?.slice(0, 4).map(t => t.name) || [],
    };

    // Check for Wikipedia link
    const wikiUrl = extractWikipediaUrl(detail.relations);
    if (wikiUrl) {
      (data as any)._wikiUrl = wikiUrl;
    }

    return {
      data,
      source: SOURCES.MUSICBRAINZ,
      fetchedAt: Date.now(),
    };
  } catch (error) {
    console.error('[MusicBrainz] Album fetch error:', error);
    return null;
  }
}

/**
 * Get MBID for an artist (useful for downstream sources like Fanart.tv)
 */
export async function getArtistMbid(name: string): Promise<string | null> {
  try {
    const result = await searchArtist(name);
    return result?.id || null;
  } catch {
    return null;
  }
}

/**
 * Get MBID for a release group
 */
export async function getAlbumMbid(album: string, artist: string): Promise<string | null> {
  try {
    const result = await searchReleaseGroup(album, artist);
    return result?.id || null;
  } catch {
    return null;
  }
}
