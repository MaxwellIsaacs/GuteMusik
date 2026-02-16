/**
 * Wikipedia Source Provider
 * Tier 3 - Community-driven encyclopedia
 * Fetches article summaries for artist/album biographies
 */

import { fetchWithTimeout } from '../rateLimit';
import { SOURCES, type SourcedResult } from './types';

interface WikiSummary {
  title: string;
  extract: string;
  extract_html?: string;
  description?: string;
  content_urls?: {
    desktop: { page: string };
  };
}

/**
 * Extract language and article title from Wikipedia URL
 */
export function parseWikipediaUrl(url: string): { lang: string; title: string } | null {
  const match = url.match(/\/\/(\w+)\.wikipedia\.org\/wiki\/(.+)$/);
  if (!match) return null;
  return {
    lang: match[1],
    title: decodeURIComponent(match[2]),
  };
}

/**
 * Fetch Wikipedia article summary
 */
export async function fetchWikipediaSummary(
  articleTitle: string,
  lang: string = 'en',
  signal?: AbortSignal
): Promise<WikiSummary | null> {
  try {
    const url = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(articleTitle)}`;
    const response = await fetchWithTimeout(url, { signal, timeout: 8000 });

    if (!response.ok) return null;
    return response.json();
  } catch (error) {
    console.error('[Wikipedia] Fetch error:', error);
    return null;
  }
}

/**
 * Fetch biography from a Wikipedia URL (extracted from MusicBrainz)
 */
export async function fetchBioFromWikiUrl(
  wikiUrl: string,
  signal?: AbortSignal
): Promise<SourcedResult<{ bio: string; bioSummary: string; wikiUrl: string }> | null> {
  const parsed = parseWikipediaUrl(wikiUrl);
  if (!parsed) return null;

  const summary = await fetchWikipediaSummary(parsed.title, parsed.lang, signal);
  if (!summary?.extract) return null;

  // Create summary from first 2-3 sentences
  const sentences = summary.extract.split(/(?<=[.!?])\s+/);
  const bioSummary = sentences.slice(0, 3).join(' ');

  return {
    data: {
      bio: summary.extract,
      bioSummary,
      wikiUrl: summary.content_urls?.desktop?.page || wikiUrl,
    },
    source: SOURCES.WIKIPEDIA,
    fetchedAt: Date.now(),
  };
}

/**
 * Search Wikipedia directly for an artist/album
 */
export async function searchWikipedia(
  query: string,
  signal?: AbortSignal
): Promise<string | null> {
  try {
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=1&format=json&origin=*`;
    const response = await fetchWithTimeout(searchUrl, { signal, timeout: 8000 });

    if (!response.ok) return null;

    const data = await response.json();
    // OpenSearch returns [query, [titles], [descriptions], [urls]]
    const titles = data[1];
    return titles?.[0] || null;
  } catch (error) {
    console.error('[Wikipedia] Search error:', error);
    return null;
  }
}

/**
 * Fetch artist bio by searching Wikipedia directly
 */
export async function fetchArtistBio(
  artistName: string,
  signal?: AbortSignal
): Promise<SourcedResult<{ bio: string; bioSummary: string }> | null> {
  // Try common patterns for artist pages
  const searchTerms = [
    `${artistName} (band)`,
    `${artistName} (musician)`,
    `${artistName} (singer)`,
    artistName,
  ];

  for (const term of searchTerms) {
    const title = await searchWikipedia(term, signal);
    if (title) {
      const summary = await fetchWikipediaSummary(title, 'en', signal);
      if (summary?.extract && summary.extract.length > 100) {
        const sentences = summary.extract.split(/(?<=[.!?])\s+/);
        return {
          data: {
            bio: summary.extract,
            bioSummary: sentences.slice(0, 3).join(' '),
          },
          source: SOURCES.WIKIPEDIA,
          fetchedAt: Date.now(),
        };
      }
    }
  }

  return null;
}

/**
 * Fetch album description by searching Wikipedia
 */
export async function fetchAlbumDescription(
  albumTitle: string,
  artistName: string,
  signal?: AbortSignal
): Promise<SourcedResult<{ description: string; descriptionSummary: string }> | null> {
  // Try album-specific search
  const searchTerms = [
    `${albumTitle} (${artistName} album)`,
    `${albumTitle} (album)`,
    `${albumTitle} ${artistName}`,
  ];

  for (const term of searchTerms) {
    const title = await searchWikipedia(term, signal);
    if (title) {
      const summary = await fetchWikipediaSummary(title, 'en', signal);
      if (summary?.extract && summary.extract.length > 100) {
        const sentences = summary.extract.split(/(?<=[.!?])\s+/);
        return {
          data: {
            description: summary.extract,
            descriptionSummary: sentences.slice(0, 3).join(' '),
          },
          source: SOURCES.WIKIPEDIA,
          fetchedAt: Date.now(),
        };
      }
    }
  }

  return null;
}
