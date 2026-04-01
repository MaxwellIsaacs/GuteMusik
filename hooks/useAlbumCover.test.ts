import { describe, it, expect, vi } from 'vitest';

// Mock dependencies (hoisted before imports)
vi.mock('../services/aggregator', () => ({
  fetchAlbumCover: vi.fn(),
}));

vi.mock('../utils/placeholders', () => ({
  PLACEHOLDER_COVER: 'data:image/svg+xml,placeholder',
}));

import { isMissingCover, getCachedAlbumCover } from './useAlbumCover';

describe('useAlbumCover utilities', () => {
  // 1. test_album_cover_subsonic_url — valid server cover is not "missing"
  it('should identify valid server cover URLs as not missing', () => {
    expect(isMissingCover('https://server.com/rest/getCoverArt?id=al-123&size=300')).toBe(false);
    expect(isMissingCover('https://music.example.com/coverart/abc123.jpg')).toBe(false);
  });

  // 2. test_album_cover_fallback — placeholder/missing patterns detected
  it('should detect missing or placeholder cover URLs', () => {
    expect(isMissingCover('')).toBe(true);
    expect(isMissingCover('https://server.com/placeholder.png')).toBe(true);
    expect(isMissingCover('https://server.com/default-cover.png')).toBe(true);
    expect(isMissingCover('https://server.com/nocover.png')).toBe(true);
    expect(isMissingCover('/cover')).toBe(true);
    expect(isMissingCover('short')).toBe(true); // length < 10
  });
});

describe('useAlbumCover cache', () => {
  // 3. test_album_cover_cache_miss
  it('should return null for uncached album covers', () => {
    const result = getCachedAlbumCover('Unknown Artist', 'Unknown Album');
    expect(result).toBeNull();
  });

  // 4. getCachedAlbumCover uses case-insensitive keys
  it('should return null for unknown artist/album combos (cache empty)', () => {
    const result1 = getCachedAlbumCover('Radiohead', 'OK Computer');
    const result2 = getCachedAlbumCover('radiohead', 'ok computer');
    expect(result1).toBeNull();
    expect(result2).toBeNull();
  });
});
