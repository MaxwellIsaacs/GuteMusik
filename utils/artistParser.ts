// Utility to detect and parse multi-artist names
// Handles cases like "Artist A / Artist B" while preserving "Tyler, The Creator"

// Patterns that indicate this is a single artist despite having commas/special chars
const SINGLE_ARTIST_PATTERNS = [
  /,\s*the\s/i,           // "Tyler, The Creator", "Florence + The Machine"
  /,\s*jr\.?$/i,          // "Sammy Davis, Jr."
  /,\s*sr\.?$/i,          // "Name, Sr."
  /,\s*[IVX]+$/,          // "Name, III" (roman numerals)
  /\s&\sthe\s/i,          // "Tom Petty & The Heartbreakers"
  /\s\+\sthe\s/i,         // "Florence + The Machine"
];

// Known single artists that look like multiple artists
const KNOWN_SINGLE_ARTISTS = new Set([
  'tyler, the creator',
  'earth, wind & fire',
  'earth wind & fire',
  'crosby, stills & nash',
  'crosby, stills, nash & young',
  'emerson, lake & palmer',
  'peter, paul and mary',
  'peter, paul & mary',
  'simon & garfunkel',
  'hall & oates',
  'belle & sebastian',
  'the mamas & the papas',
  'brooks & dunn',
  'florida georgia line',
  'capital cities',
  'twenty one pilots',
  'tegan and sara',
  'for king & country',
  'dan + shay',
  'love and theft',
  'sugarland',
  'lady a',
  'the civil wars',
]);

// Separators that clearly indicate multiple artists
const MULTI_ARTIST_SEPARATORS = [
  /\s\/\s/,               // " / "
  /\//,                   // "/" (any slash - catches "Artist/Artist")
  /\s;\s/,                // " ; "
  /\sfeat\.?\s/i,         // " feat " or " feat. "
  /\sft\.?\s/i,           // " ft " or " ft. "
  /\sfeaturing\s/i,       // " featuring "
  /\swith\s/i,            // " with " (in artist context)
  /\sx\s(?=[A-Z])/,       // " x " followed by capital (collab notation)
];

// Separators that might indicate multiple artists (need more context)
const AMBIGUOUS_SEPARATORS = [
  /,\s+(?=[A-Z])/,        // ", " followed by capital letter
  /\s&\s(?![Tt]he\s)/,    // " & " not followed by "The"
];

export interface ArtistParseResult {
  originalName: string;
  isMultiArtist: boolean;
  confidence: 'high' | 'medium' | 'low';
  artists: string[];
  primaryArtist: string;
  separatorUsed: string | null;
}

/**
 * Analyzes an artist name to determine if it represents multiple artists
 */
export function parseArtistName(artistName: string): ArtistParseResult {
  if (!artistName || artistName.trim() === '') {
    return {
      originalName: artistName,
      isMultiArtist: false,
      confidence: 'high',
      artists: [],
      primaryArtist: '',
      separatorUsed: null,
    };
  }

  const name = artistName.trim();
  const nameLower = name.toLowerCase();

  // Check if it's a known single artist
  if (KNOWN_SINGLE_ARTISTS.has(nameLower)) {
    return {
      originalName: name,
      isMultiArtist: false,
      confidence: 'high',
      artists: [name],
      primaryArtist: name,
      separatorUsed: null,
    };
  }

  // Check single artist patterns
  for (const pattern of SINGLE_ARTIST_PATTERNS) {
    if (pattern.test(name)) {
      return {
        originalName: name,
        isMultiArtist: false,
        confidence: 'high',
        artists: [name],
        primaryArtist: name,
        separatorUsed: null,
      };
    }
  }

  // Check for clear multi-artist separators
  for (const pattern of MULTI_ARTIST_SEPARATORS) {
    const match = name.match(pattern);
    if (match) {
      const separator = match[0];
      const parts = name.split(pattern).map(p => p.trim()).filter(p => p.length > 0);

      if (parts.length > 1) {
        return {
          originalName: name,
          isMultiArtist: true,
          confidence: 'high',
          artists: parts,
          primaryArtist: parts[0],
          separatorUsed: separator.trim(),
        };
      }
    }
  }

  // Check for ambiguous separators
  for (const pattern of AMBIGUOUS_SEPARATORS) {
    const match = name.match(pattern);
    if (match) {
      const separator = match[0];
      const parts = name.split(pattern).map(p => p.trim()).filter(p => p.length > 0);

      // Additional heuristic: if parts look like separate names (both have multiple words or are short)
      if (parts.length > 1 && parts.every(p => p.length > 1)) {
        // Check if any part looks like a continuation (starts with lowercase)
        const looksLikeContinuation = parts.slice(1).some(p => /^[a-z]/.test(p));

        if (!looksLikeContinuation) {
          return {
            originalName: name,
            isMultiArtist: true,
            confidence: 'medium',
            artists: parts,
            primaryArtist: parts[0],
            separatorUsed: separator.trim(),
          };
        }
      }
    }
  }

  // No multi-artist indicators found
  return {
    originalName: name,
    isMultiArtist: false,
    confidence: 'high',
    artists: [name],
    primaryArtist: name,
    separatorUsed: null,
  };
}

/**
 * Categorizes a list of artists into single and multi-artist entries
 */
export function categorizeArtists<T extends { name: string }>(
  artists: T[]
): {
  singleArtists: (T & { parseResult: ArtistParseResult })[];
  multiArtists: (T & { parseResult: ArtistParseResult })[];
  all: (T & { parseResult: ArtistParseResult })[];
} {
  const all = artists.map(artist => ({
    ...artist,
    parseResult: parseArtistName(artist.name),
  }));

  return {
    singleArtists: all.filter(a => !a.parseResult.isMultiArtist),
    multiArtists: all.filter(a => a.parseResult.isMultiArtist),
    all,
  };
}

/**
 * Gets the primary artist name from a potentially multi-artist string
 */
export function getPrimaryArtist(artistName: string): string {
  const result = parseArtistName(artistName);
  return result.primaryArtist;
}

/**
 * Checks if an artist name likely represents multiple artists
 */
export function isMultiArtist(artistName: string): boolean {
  return parseArtistName(artistName).isMultiArtist;
}
