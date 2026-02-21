/**
 * Lyrics Service with LRCLIB fallback
 * Fetches lyrics from Navidrome first, then falls back to LRCLIB API
 */

export interface SyncedLyric {
  time: number; // Time in seconds
  text: string;
}

export interface LyricsResult {
  lyrics: SyncedLyric[];
  isSynced: boolean;
  source: 'navidrome' | 'lrclib';
}

// Parse LRC format timestamps like [00:15.30] or [00:15:30]
function parseLrcTime(timeStr: string): number {
  // Match formats: [mm:ss.xx], [mm:ss:xx], [mm:ss]
  const match = timeStr.match(/\[(\d+):(\d+)(?:[.:](\d+))?\]/);
  if (!match) return -1;

  const minutes = parseInt(match[1], 10);
  const seconds = parseInt(match[2], 10);
  const centiseconds = match[3] ? parseInt(match[3].padEnd(2, '0').slice(0, 2), 10) : 0;

  return minutes * 60 + seconds + centiseconds / 100;
}

// Parse LRC formatted lyrics into synced lyrics array
export function parseLrcLyrics(lrcText: string): SyncedLyric[] {
  const lines = lrcText.split('\n');
  const syncedLyrics: SyncedLyric[] = [];

  for (const line of lines) {
    // Skip metadata lines like [ar:Artist], [ti:Title], etc.
    if (line.match(/^\[(ar|ti|al|au|length|by|offset|re|ve):/i)) {
      continue;
    }

    // Match timestamp and text
    const timestampMatches = line.match(/\[\d+:\d+(?:[.:]\d+)?\]/g);
    if (!timestampMatches) continue;

    // Get the text after all timestamps
    const text = line.replace(/\[\d+:\d+(?:[.:]\d+)?\]/g, '').trim();
    if (!text) continue;

    // Each timestamp can map to the same text (for repeated lines)
    for (const timestamp of timestampMatches) {
      const time = parseLrcTime(timestamp);
      if (time >= 0) {
        syncedLyrics.push({ time, text });
      }
    }
  }

  // Sort by time
  syncedLyrics.sort((a, b) => a.time - b.time);

  return syncedLyrics;
}

// Parse plain text lyrics (no timestamps)
export function parsePlainLyrics(text: string): SyncedLyric[] {
  return text
    .split('\n')
    .filter(line => line.trim())
    .map((line, index) => ({
      time: -1, // No timestamp
      text: line.trim(),
    }));
}

// Check if lyrics have timestamps
function hasTimestamps(text: string): boolean {
  return /\[\d+:\d+(?:[.:]\d+)?\]/.test(text);
}

interface LrclibResponse {
  id: number;
  trackName: string;
  artistName: string;
  albumName: string;
  duration: number;
  instrumental: boolean;
  plainLyrics: string | null;
  syncedLyrics: string | null;
}

// Fetch lyrics from LRCLIB API - use search first as it's more forgiving
async function fetchFromLrclib(
  artist: string,
  title: string,
  album?: string,
  duration?: number
): Promise<LyricsResult | null> {
  // Try search endpoint first - it's more forgiving with artist/title variations
  const searchResult = await searchLrclib(artist, title);
  if (searchResult) {
    return searchResult;
  }

  // Fall back to exact match endpoint
  try {
    const params = new URLSearchParams({
      artist_name: artist,
      track_name: title,
    });

    if (album) {
      params.set('album_name', album);
    }

    if (duration && duration > 0) {
      params.set('duration', Math.round(duration).toString());
    }

    const response = await fetch(`https://lrclib.net/api/get?${params.toString()}`);

    if (!response.ok) {
      return null;
    }

    const data: LrclibResponse = await response.json();

    if (data.instrumental) {
      return {
        lyrics: [{ time: -1, text: '♪ Instrumental ♪' }],
        isSynced: false,
        source: 'lrclib',
      };
    }

    if (data.syncedLyrics) {
      const lyrics = parseLrcLyrics(data.syncedLyrics);
      if (lyrics.length > 0) {
        return {
          lyrics,
          isSynced: true,
          source: 'lrclib',
        };
      }
    }

    if (data.plainLyrics) {
      return {
        lyrics: parsePlainLyrics(data.plainLyrics),
        isSynced: false,
        source: 'lrclib',
      };
    }

    return null;
  } catch (error) {
    console.error('LRCLIB get error:', error);
    return null;
  }
}

// Search LRCLIB - more forgiving than exact match
async function searchLrclib(artist: string, title: string): Promise<LyricsResult | null> {
  try {
    // Clean up artist/title - remove featuring artists, parenthetical info, etc.
    const cleanTitle = title
      .replace(/\s*\(.*?\)\s*/g, '') // Remove (feat. X), (Remastered), etc.
      .replace(/\s*\[.*?\]\s*/g, '') // Remove [Explicit], etc.
      .replace(/\s*-\s*.*$/, '')     // Remove "- Single Version" etc.
      .trim();

    const cleanArtist = artist
      .replace(/\s*&\s*.*$/, '')     // Remove "& Other Artist"
      .replace(/\s*,\s*.*$/, '')     // Remove ", Other Artist"
      .replace(/\s*feat\.?\s*.*$/i, '') // Remove "feat. X"
      .trim();

    const query = `${cleanArtist} ${cleanTitle}`;
    console.log('LRCLIB search query:', query);

    const response = await fetch(
      `https://lrclib.net/api/search?q=${encodeURIComponent(query)}`
    );

    if (!response.ok) {
      console.error('LRCLIB search failed:', response.status, response.statusText);
      return null;
    }

    const results: LrclibResponse[] = await response.json();
    console.log('LRCLIB search results:', results.length);

    if (!results || results.length === 0) return null;

    // Find best match - prefer one with synced lyrics
    const matchWithSynced = results.find(r => r.syncedLyrics);
    const match = matchWithSynced || results[0];

    if (match.instrumental) {
      return {
        lyrics: [{ time: -1, text: '♪ Instrumental ♪' }],
        isSynced: false,
        source: 'lrclib',
      };
    }

    if (match.syncedLyrics) {
      const lyrics = parseLrcLyrics(match.syncedLyrics);
      if (lyrics.length > 0) {
        return {
          lyrics,
          isSynced: true,
          source: 'lrclib',
        };
      }
    }

    if (match.plainLyrics) {
      return {
        lyrics: parsePlainLyrics(match.plainLyrics),
        isSynced: false,
        source: 'lrclib',
      };
    }

    return null;
  } catch (error) {
    console.error('LRCLIB search error:', error);
    return null;
  }
}

// Parse Navidrome lyrics response
function parseNavidromeLyrics(text: string): LyricsResult {
  if (hasTimestamps(text)) {
    return {
      lyrics: parseLrcLyrics(text),
      isSynced: true,
      source: 'navidrome',
    };
  }

  return {
    lyrics: parsePlainLyrics(text),
    isSynced: false,
    source: 'navidrome',
  };
}

// Check if lyrics are actually valid content (not just metadata/provider info)
function isValidLyricsContent(text: string, lyrics: SyncedLyric[]): boolean {
  // Too few lines - probably just metadata
  if (lyrics.length < 4) {
    console.log('Navidrome lyrics rejected: too few lines', lyrics.length);
    return false;
  }

  // Total content too short - probably just provider name/metadata
  const totalChars = lyrics.reduce((sum, l) => sum + l.text.length, 0);
  if (totalChars < 100) {
    console.log('Navidrome lyrics rejected: too short', totalChars, 'chars');
    return false;
  }

  // Check for common metadata patterns (provider names, credits, etc.)
  const lowerText = text.toLowerCase();
  const metadataPatterns = [
    'lyrics provided by',
    'lyrics by',
    'powered by',
    'courtesy of',
    'musixmatch',
    'genius.com',
    'azlyrics',
    'lyrics licensed',
    'all rights reserved',
    '© lyrics',
  ];

  // If the entire content is mostly metadata
  for (const pattern of metadataPatterns) {
    if (lowerText.includes(pattern) && totalChars < 200) {
      console.log('Navidrome lyrics rejected: looks like metadata', pattern);
      return false;
    }
  }

  return true;
}

export interface LyricsFetchOptions {
  artist: string;
  title: string;
  album?: string;
  duration?: number;
  trackId?: string;
  navidromeFetcher?: (artist: string, title: string) => Promise<string | null>;
}

// In-memory lyrics cache — keyed by trackId, lives until the track changes
const lyricsCache = new Map<string, LyricsResult | null>();

/** Clear cached lyrics for all tracks except the given one */
export function prunelyricsCacheExcept(currentTrackId?: string) {
  if (!currentTrackId) {
    lyricsCache.clear();
    return;
  }
  for (const key of lyricsCache.keys()) {
    if (key !== currentTrackId) {
      lyricsCache.delete(key);
    }
  }
}

/**
 * Fetch lyrics with fallback chain:
 * 1. In-memory cache (if trackId provided)
 * 2. Navidrome server (if fetcher provided)
 * 3. LRCLIB API
 */
export async function fetchLyrics(options: LyricsFetchOptions): Promise<LyricsResult | null> {
  const { artist, title, album, duration, trackId, navidromeFetcher } = options;

  // Return cached result if available
  if (trackId && lyricsCache.has(trackId)) {
    console.log('Lyrics served from cache for track', trackId);
    return lyricsCache.get(trackId)!;
  }

  // Evict stale entries — only keep the current track cached
  if (trackId) {
    prunelyricsCacheExcept(trackId);
  }

  // Try Navidrome first
  if (navidromeFetcher) {
    try {
      const navidromeLyrics = await navidromeFetcher(artist, title);
      if (navidromeLyrics && navidromeLyrics.trim()) {
        const result = parseNavidromeLyrics(navidromeLyrics);
        // Validate that lyrics are real content, not just provider metadata
        if (result.lyrics.length > 0 && isValidLyricsContent(navidromeLyrics, result.lyrics)) {
          console.log('Lyrics found from Navidrome');
          if (trackId) lyricsCache.set(trackId, result);
          return result;
        } else {
          console.log('Navidrome lyrics appear to be metadata only, trying LRCLIB...');
        }
      }
    } catch (error) {
      console.error('Navidrome lyrics fetch failed:', error);
    }
  }

  // Fall back to LRCLIB
  console.log('Trying LRCLIB for lyrics...');
  const lrclibResult = await fetchFromLrclib(artist, title, album, duration);

  if (lrclibResult) {
    console.log(`Lyrics found from LRCLIB (${lrclibResult.isSynced ? 'synced' : 'plain'})`);
    if (trackId) lyricsCache.set(trackId, lrclibResult);
    return lrclibResult;
  }

  console.log('No lyrics found from any source');
  if (trackId) lyricsCache.set(trackId, null);
  return null;
}

/**
 * Find the active lyric index based on current playback time
 */
export function findActiveLyricIndex(
  lyrics: SyncedLyric[],
  currentTime: number,
  isSynced: boolean,
  duration: number
): number {
  if (lyrics.length === 0) return -1;

  if (isSynced) {
    // Use actual timestamps
    for (let i = lyrics.length - 1; i >= 0; i--) {
      if (currentTime >= lyrics[i].time) {
        return i;
      }
    }
    return 0;
  } else {
    // Fall back to even distribution for unsynced lyrics
    if (duration <= 0) return 0;
    const timePerLine = duration / lyrics.length;
    return Math.min(Math.floor(currentTime / timePerLine), lyrics.length - 1);
  }
}
