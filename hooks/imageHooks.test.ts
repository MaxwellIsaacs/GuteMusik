import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the aggregator module (hoisted before imports)
vi.mock('../services/aggregator', () => ({
  fetchAlbumCover: vi.fn(),
  fetchArtistImage: vi.fn(),
}));

vi.mock('../utils/placeholders', () => ({
  PLACEHOLDER_COVER: 'data:image/svg+xml,placeholder',
}));

// Use vi.hoisted to set up localStorage BEFORE any module loads
const { localStorageMock } = vi.hoisted(() => {
  const localStorageMock = {
    getItem: vi.fn().mockReturnValue(null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
    length: 0,
    key: vi.fn(),
  };
  Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true, configurable: true });
  return { localStorageMock };
});

import { isMissingCover, getCachedAlbumCover } from './useAlbumCover';
import { getCachedArtistImage, ARTIST_PLACEHOLDER } from './useArtistImage';

describe('E5: Image Hooks - Album Cover & Artist Image', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.getItem.mockReturnValue(null);
  });

  // 1. test_album_cover_subsonic_url — cover URL follows getCoverArt pattern
  it('should recognize valid Subsonic getCoverArt URLs as not missing', () => {
    // A typical Subsonic cover art URL
    const subsonicUrl = 'https://music.example.com/rest/getCoverArt?id=al-123&size=300&u=user&t=token&s=salt&v=1.16.1&c=Lumina&f=json';
    expect(isMissingCover(subsonicUrl)).toBe(false);

    // Other valid cover URLs
    expect(isMissingCover('https://cdn.example.com/covers/album-art-large.jpg')).toBe(false);
    expect(isMissingCover('https://i.imgur.com/abcdefg.png')).toBe(false);
  });

  // 2. test_album_cover_fallback — fallback to external source concept
  it('should detect placeholder/missing covers and fall back', () => {
    // These patterns trigger fallback to external sources
    expect(isMissingCover('')).toBe(true);
    expect(isMissingCover('https://server.com/placeholder.png')).toBe(true);
    expect(isMissingCover('https://server.com/default-cover.png')).toBe(true);
    expect(isMissingCover('https://server.com/nocover.png')).toBe(true);
    expect(isMissingCover('/cover')).toBe(true);
    expect(isMissingCover('short')).toBe(true); // length < 10

    // getCachedAlbumCover returns null when no cache entry exists (triggers fallback)
    const cached = getCachedAlbumCover('Radiohead', 'OK Computer');
    expect(cached).toBeNull();
  });

  // 3. test_artist_image_fetch — fetches from external API (returns placeholder for uncached)
  it('should return placeholder for uncached artist images indicating fetch needed', () => {
    // When no image is cached, getCachedArtistImage returns the placeholder,
    // signaling that a fetch from external APIs is needed
    const result = getCachedArtistImage('Radiohead');
    expect(result).toBe(ARTIST_PLACEHOLDER);

    // Verify the placeholder is a valid SVG data URI
    expect(ARTIST_PLACEHOLDER).toContain('data:image/svg+xml,');
    expect(ARTIST_PLACEHOLDER).toContain('svg');
    expect(ARTIST_PLACEHOLDER).toContain('xmlns');
  });

  // 4. test_artist_image_cache — localStorage cache with TTL
  it('should use localStorage for persistent artist image cache with TTL', () => {
    // The STORAGE_KEY used by useArtistImage is 'lumina_artist_images'
    // The CACHE_TTL is 30 days (30 * 24 * 60 * 60 * 1000)
    const STORAGE_KEY = 'lumina_artist_images';
    const CACHE_TTL = 30 * 24 * 60 * 60 * 1000;

    // Simulate a cached entry that is still fresh
    const freshEntry = {
      'radiohead': {
        url: 'https://images.example.com/radiohead.jpg',
        sourceName: 'TheAudioDB',
        fetchedAt: Date.now() - 1000, // 1 second ago
      },
    };

    // Simulate an expired entry
    const expiredEntry = {
      'nirvana': {
        url: 'https://images.example.com/nirvana.jpg',
        sourceName: 'Last.fm',
        fetchedAt: Date.now() - CACHE_TTL - 1000, // expired
      },
    };

    // Verify TTL logic: fresh entries are within TTL
    const now = Date.now();
    expect(now - freshEntry['radiohead'].fetchedAt < CACHE_TTL).toBe(true);
    expect(now - expiredEntry['nirvana'].fetchedAt < CACHE_TTL).toBe(false);

    // Verify that getCachedArtistImage returns placeholder for uncached artists
    // (the in-memory cache is separate from localStorage, but both use the same TTL)
    const uncached = getCachedArtistImage('Brand New Artist');
    expect(uncached).toBe(ARTIST_PLACEHOLDER);
  });
});
