/**
 * Source Aggregator
 * Orchestrates multiple data sources with credibility-based priority
 * Tries sources in tier order and returns first successful result with attribution
 */

import {
  SourceTier,
  type SourceInfo,
  type SourcedResult,
  type ArtistData,
  type AlbumData,
  type ImageData,
  type ArtistQuery,
  type AlbumQuery,
} from './sources/types';

import * as musicbrainz from './sources/musicbrainz';
import * as wikipedia from './sources/wikipedia';
import * as discogs from './sources/discogs';
import * as lastfm from './sources/lastfm';
import * as theaudiodb from './sources/theaudiodb';
import * as wikidata from './sources/wikidata';
import * as coverartarchive from './sources/coverartarchive';
import * as fanart from './sources/fanart';
import * as itunes from './sources/itunes';

// Cache for aggregated results
interface CacheEntry<T> {
  result: SourcedResult<T>;
  expiresAt: number;
}

const artistInfoCache = new Map<string, CacheEntry<ArtistData>>();
const albumInfoCache = new Map<string, CacheEntry<AlbumData>>();
const artistImageCache = new Map<string, CacheEntry<ImageData>>();
const albumCoverCache = new Map<string, CacheEntry<ImageData>>();

// Cache TTLs
const CACHE_TTL = {
  artistInfo: 7 * 24 * 60 * 60 * 1000,   // 7 days
  albumInfo: 7 * 24 * 60 * 60 * 1000,    // 7 days
  artistImage: 30 * 24 * 60 * 60 * 1000, // 30 days
  albumCover: 30 * 24 * 60 * 60 * 1000,  // 30 days
};

/**
 * Normalize cache key
 */
function normalizeKey(str: string): string {
  return str.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Try multiple fetch functions in order, return first success
 */
async function tryInOrder<T>(
  fetchers: (() => Promise<SourcedResult<T> | null>)[],
  signal?: AbortSignal
): Promise<SourcedResult<T> | null> {
  for (const fetcher of fetchers) {
    if (signal?.aborted) break;
    try {
      const result = await fetcher();
      if (result?.data) {
        return result;
      }
    } catch (error) {
      // Continue to next source
      console.warn('Source fetch failed, trying next:', error);
    }
  }
  return null;
}

/**
 * Merge partial data from multiple sources
 */
function mergeArtistData(
  primary: SourcedResult<ArtistData>,
  secondary: SourcedResult<ArtistData>
): SourcedResult<ArtistData> {
  return {
    data: {
      ...secondary.data,
      ...primary.data,
      // Merge arrays
      tags: [...new Set([...(primary.data.tags || []), ...(secondary.data.tags || [])])],
      genres: [...new Set([...(primary.data.genres || []), ...(secondary.data.genres || [])])],
      similarArtists: primary.data.similarArtists?.length
        ? primary.data.similarArtists
        : secondary.data.similarArtists,
      links: [...(primary.data.links || []), ...(secondary.data.links || [])],
    },
    source: primary.source, // Primary source gets attribution
    fetchedAt: primary.fetchedAt,
  };
}

/**
 * Merge partial album data from multiple sources
 */
function mergeAlbumData(
  primary: SourcedResult<AlbumData>,
  secondary: SourcedResult<AlbumData>
): SourcedResult<AlbumData> {
  return {
    data: {
      ...secondary.data,
      ...primary.data,
      // Merge arrays
      genres: [...new Set([...(primary.data.genres || []), ...(secondary.data.genres || [])])],
      tags: [...new Set([...(primary.data.tags || []), ...(secondary.data.tags || [])])],
      credits: [...(primary.data.credits || []), ...(secondary.data.credits || [])],
    },
    source: primary.source,
    fetchedAt: primary.fetchedAt,
  };
}

// ============================================================
// ARTIST INFO AGGREGATOR
// ============================================================

/**
 * Fetch artist info from multiple sources (priority order by tier)
 * Sources: MusicBrainz → Discogs → Last.fm → TheAudioDB → Wikidata
 */
export async function fetchArtistInfo(
  query: ArtistQuery,
  signal?: AbortSignal
): Promise<SourcedResult<ArtistData> | null> {
  const cacheKey = normalizeKey(query.name);

  // Check cache
  const cached = artistInfoCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.result;
  }

  // Try sources in credibility order
  const fetchers = [
    // Tier 1 - Professional
    () => musicbrainz.fetchArtistData(query, signal),
    () => discogs.fetchArtistData(query, signal),
    // Tier 3 - Community
    () => lastfm.fetchArtistData(query, signal),
    () => theaudiodb.fetchArtistData(query, signal),
    () => wikidata.fetchArtistData(query, signal),
  ];

  // Get primary result
  let result = await tryInOrder(fetchers, signal);

  // If we got basic data but no bio, try to enhance with Wikipedia
  if (result && (!result.data.bio || result.data.bio.length < 100)) {
    // Check if MusicBrainz gave us a wiki URL
    const mbResult = result.source.name === 'MusicBrainz' ? result : null;
    const wikiUrl = (mbResult?.data as any)?._wikiUrl;

    if (wikiUrl) {
      const wikiBio = await wikipedia.fetchBioFromWikiUrl(wikiUrl, signal);
      if (wikiBio) {
        result = {
          ...result,
          data: {
            ...result.data,
            bio: wikiBio.data.bio,
            bioSummary: wikiBio.data.bioSummary,
          },
        };
      }
    } else {
      // Try direct Wikipedia search
      const wikiBio = await wikipedia.fetchArtistBio(query.name, signal);
      if (wikiBio) {
        result = {
          ...result,
          data: {
            ...result.data,
            bio: wikiBio.data.bio,
            bioSummary: wikiBio.data.bioSummary,
          },
        };
      }
    }
  }

  // Try to get similar artists from Last.fm if not present
  if (result && !result.data.similarArtists?.length) {
    const similar = await lastfm.fetchSimilarArtists(query.name, 5, signal);
    if (similar.length) {
      result = {
        ...result,
        data: {
          ...result.data,
          similarArtists: similar,
        },
      };
    }
  }

  // Cache result
  if (result) {
    artistInfoCache.set(cacheKey, {
      result,
      expiresAt: Date.now() + CACHE_TTL.artistInfo,
    });
  }

  return result;
}

// ============================================================
// ALBUM INFO AGGREGATOR
// ============================================================

/**
 * Fetch album info from multiple sources
 * Sources: MusicBrainz → Discogs → Last.fm → TheAudioDB
 */
export async function fetchAlbumInfo(
  query: AlbumQuery,
  signal?: AbortSignal
): Promise<SourcedResult<AlbumData> | null> {
  const cacheKey = `${normalizeKey(query.artist)}|${normalizeKey(query.title)}`;

  // Check cache
  const cached = albumInfoCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.result;
  }

  const fetchers = [
    // Tier 1
    () => musicbrainz.fetchAlbumData(query, signal),
    () => discogs.fetchAlbumData(query, signal),
    // Tier 3
    () => lastfm.fetchAlbumData(query, signal),
    () => theaudiodb.fetchAlbumData(query, signal),
    () => wikidata.fetchAlbumData(query, signal),
  ];

  let result = await tryInOrder(fetchers, signal);

  // If we got basic data but no description, try Wikipedia
  if (result && (!result.data.description || result.data.description.length < 100)) {
    const wikiDesc = await wikipedia.fetchAlbumDescription(
      query.title,
      query.artist,
      signal
    );
    if (wikiDesc) {
      result = {
        ...result,
        data: {
          ...result.data,
          description: wikiDesc.data.description,
          descriptionSummary: wikiDesc.data.descriptionSummary,
        },
      };
    }
  }

  // Cache result
  if (result) {
    albumInfoCache.set(cacheKey, {
      result,
      expiresAt: Date.now() + CACHE_TTL.albumInfo,
    });
  }

  return result;
}

// ============================================================
// ARTIST IMAGE AGGREGATOR
// ============================================================

/**
 * Fetch artist image from multiple sources
 * Sources: TheAudioDB → Fanart.tv → Discogs → Last.fm
 */
export async function fetchArtistImage(
  query: ArtistQuery,
  signal?: AbortSignal
): Promise<SourcedResult<ImageData> | null> {
  const cacheKey = normalizeKey(query.name);

  // Check cache
  const cached = artistImageCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.result;
  }

  const fetchers = [
    // Tier 3 - Good coverage, fast
    () => theaudiodb.fetchArtistImage(query, signal),
    // Tier 4 - High quality
    () => fanart.fetchArtistImage(query, signal),
    // Tier 1 - Reliable
    () => discogs.fetchArtistImage(query, signal),
    // Tier 3 - Fallback
    () => lastfm.fetchArtistImage(query, signal),
  ];

  const result = await tryInOrder(fetchers, signal);

  // Cache result
  if (result) {
    artistImageCache.set(cacheKey, {
      result,
      expiresAt: Date.now() + CACHE_TTL.artistImage,
    });
  }

  return result;
}

/**
 * Fetch artist background/fanart specifically
 */
export async function fetchArtistBackground(
  query: ArtistQuery,
  signal?: AbortSignal
): Promise<SourcedResult<ImageData> | null> {
  const fetchers = [
    () => fanart.fetchArtistBackground(query, signal),
    () => theaudiodb.fetchArtistBackground(query, signal),
  ];

  return tryInOrder(fetchers, signal);
}

// ============================================================
// ALBUM COVER AGGREGATOR
// ============================================================

/**
 * Fetch album cover from multiple sources
 * Sources: Cover Art Archive → iTunes → Discogs → TheAudioDB → Last.fm
 */
export async function fetchAlbumCover(
  query: AlbumQuery,
  signal?: AbortSignal
): Promise<SourcedResult<ImageData> | null> {
  const cacheKey = `${normalizeKey(query.artist)}|${normalizeKey(query.title)}`;

  // Check cache
  const cached = albumCoverCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.result;
  }

  const fetchers = [
    // Tier 1 - Highest quality
    () => coverartarchive.fetchAlbumCover(query, signal),
    // Tier 2 - Commercial quality
    () => itunes.fetchAlbumCover(query, signal),
    // Tier 1 - Reliable
    () => discogs.fetchAlbumCover(query, signal),
    // Tier 3 - Fallbacks
    () => theaudiodb.fetchAlbumCover(query, signal),
    () => lastfm.fetchAlbumCover(query, signal),
  ];

  const result = await tryInOrder(fetchers, signal);

  // Cache result
  if (result) {
    albumCoverCache.set(cacheKey, {
      result,
      expiresAt: Date.now() + CACHE_TTL.albumCover,
    });
  }

  return result;
}

// ============================================================
// CACHE MANAGEMENT
// ============================================================

/**
 * Clear all caches
 */
export function clearAllCaches(): void {
  artistInfoCache.clear();
  albumInfoCache.clear();
  artistImageCache.clear();
  albumCoverCache.clear();
}

/**
 * Clear expired cache entries
 */
export function clearExpiredCache(): void {
  const now = Date.now();

  for (const [key, entry] of artistInfoCache) {
    if (entry.expiresAt < now) artistInfoCache.delete(key);
  }
  for (const [key, entry] of albumInfoCache) {
    if (entry.expiresAt < now) albumInfoCache.delete(key);
  }
  for (const [key, entry] of artistImageCache) {
    if (entry.expiresAt < now) artistImageCache.delete(key);
  }
  for (const [key, entry] of albumCoverCache) {
    if (entry.expiresAt < now) albumCoverCache.delete(key);
  }
}

// ============================================================
// EXPORTS
// ============================================================

export { SOURCES, SourceTier } from './sources/types';
export type { SourceInfo, SourcedResult, ArtistData, AlbumData, ImageData } from './sources/types';
