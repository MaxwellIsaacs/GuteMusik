/**
 * Shared types for music data sources
 */

// Source credibility tiers (lower number = higher credibility)
export enum SourceTier {
  PROFESSIONAL = 1,   // MusicBrainz, Discogs, Cover Art Archive
  COMMERCIAL = 2,     // iTunes/Apple Music
  COMMUNITY = 3,      // Last.fm, TheAudioDB, Wikipedia, Wikidata
  SPECIALIZED = 4,    // LRCLIB, Fanart.tv
}

export interface SourceInfo {
  name: string;
  tier: SourceTier;
  url?: string;
}

// All sources with their info
export const SOURCES = {
  MUSICBRAINZ: { name: 'MusicBrainz', tier: SourceTier.PROFESSIONAL } as SourceInfo,
  DISCOGS: { name: 'Discogs', tier: SourceTier.PROFESSIONAL } as SourceInfo,
  COVER_ART_ARCHIVE: { name: 'Cover Art Archive', tier: SourceTier.PROFESSIONAL } as SourceInfo,
  ITUNES: { name: 'iTunes', tier: SourceTier.COMMERCIAL } as SourceInfo,
  LASTFM: { name: 'Last.fm', tier: SourceTier.COMMUNITY } as SourceInfo,
  THEAUDIODB: { name: 'TheAudioDB', tier: SourceTier.COMMUNITY } as SourceInfo,
  WIKIPEDIA: { name: 'Wikipedia', tier: SourceTier.COMMUNITY } as SourceInfo,
  WIKIDATA: { name: 'Wikidata', tier: SourceTier.COMMUNITY } as SourceInfo,
  LRCLIB: { name: 'LRCLIB', tier: SourceTier.SPECIALIZED } as SourceInfo,
  FANART: { name: 'Fanart.tv', tier: SourceTier.SPECIALIZED } as SourceInfo,
  NAVIDROME: { name: 'Server', tier: SourceTier.PROFESSIONAL } as SourceInfo,
} as const;

// Base result wrapper - all data includes source attribution
export interface SourcedResult<T> {
  data: T;
  source: SourceInfo;
  fetchedAt: number;
}

// Artist data from any source
export interface ArtistData {
  bio?: string;
  bioSummary?: string;
  tags?: string[];
  genres?: string[];
  similarArtists?: { name: string; mbid?: string }[];
  formed?: string;
  disbanded?: string;
  origin?: string;
  type?: string;
  members?: { name: string; active?: boolean }[];
  links?: { type: string; url: string }[];
  mbid?: string;
}

// Album data from any source
export interface AlbumData {
  description?: string;
  descriptionSummary?: string;
  genres?: string[];
  tags?: string[];
  releaseType?: string;
  releaseDate?: string;
  label?: string;
  credits?: { role: string; name: string }[];
  rating?: number;
  ratingCount?: number;
  tracklist?: { position: number; title: string; duration?: number }[];
  mbid?: string;
}

// Image data
export interface ImageData {
  url: string;
  width?: number;
  height?: number;
  type?: 'thumb' | 'fanart' | 'logo' | 'banner' | 'cover' | 'primary';
}

// Lyrics data (extends existing pattern)
export interface LyricsData {
  lyrics: { time: number; text: string }[];
  isSynced: boolean;
  hasAnnotations?: boolean;
}

// Query types for different data
export interface ArtistQuery {
  name: string;
  mbid?: string;
}

export interface AlbumQuery {
  title: string;
  artist: string;
  mbid?: string;
}

export interface ImageQuery {
  artistName?: string;
  albumTitle?: string;
  mbid?: string;
}

// Source provider interface
export interface SourceProvider<TQuery, TResult> {
  source: SourceInfo;
  fetch(query: TQuery, signal?: AbortSignal): Promise<TResult | null>;
}

// Rate limit configuration
export interface RateLimitConfig {
  requestsPerMinute: number;
  minIntervalMs: number;
}

// Rate limits for each source
export const RATE_LIMITS: Record<string, RateLimitConfig> = {
  musicbrainz: { requestsPerMinute: 50, minIntervalMs: 1100 },
  discogs: { requestsPerMinute: 60, minIntervalMs: 1000 },
  lastfm: { requestsPerMinute: 300, minIntervalMs: 200 },
  theaudiodb: { requestsPerMinute: 100, minIntervalMs: 600 },
  wikidata: { requestsPerMinute: 200, minIntervalMs: 300 },
  coverartarchive: { requestsPerMinute: 50, minIntervalMs: 1200 },
  fanart: { requestsPerMinute: 100, minIntervalMs: 600 },
  itunes: { requestsPerMinute: 200, minIntervalMs: 300 },
  wikipedia: { requestsPerMinute: 200, minIntervalMs: 300 },
  lrclib: { requestsPerMinute: 100, minIntervalMs: 600 },
};

// User agent for API requests
export const USER_AGENT = 'Lumina/1.0 (music-player-app)';
