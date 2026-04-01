import { describe, it, expect } from 'vitest';
import { parseArtistName } from './artistParser';

describe('artistParser', () => {
  // 1. test_single_artist
  it('should parse a single artist name', () => {
    const result = parseArtistName('Radiohead');
    expect(result.isMultiArtist).toBe(false);
    expect(result.artists).toEqual(['Radiohead']);
    expect(result.primaryArtist).toBe('Radiohead');
    expect(result.separatorUsed).toBeNull();
  });

  // 2. test_multiple_artists_comma
  it('should parse comma-separated artists', () => {
    const result = parseArtistName('Artist A, Artist B, Artist C');
    expect(result.isMultiArtist).toBe(true);
    expect(result.artists).toHaveLength(3);
    expect(result.artists).toEqual(['Artist A', 'Artist B', 'Artist C']);
    expect(result.primaryArtist).toBe('Artist A');
  });

  // 3. test_multiple_artists_ampersand
  it('should parse ampersand-separated artists when not a known duo', () => {
    const result = parseArtistName('Artist A & Artist B');
    expect(result.isMultiArtist).toBe(true);
    expect(result.artists).toHaveLength(2);
    expect(result.artists).toEqual(['Artist A', 'Artist B']);
  });

  // 4. test_multiple_artists_feat
  it('should parse "feat." separated artists', () => {
    const result = parseArtistName('Artist A feat. Artist B');
    expect(result.isMultiArtist).toBe(true);
    expect(result.artists).toEqual(['Artist A', 'Artist B']);
    expect(result.primaryArtist).toBe('Artist A');
  });

  // 5. test_multiple_artists_with
  it('should parse "with" separated artists', () => {
    const result = parseArtistName('Artist A with Artist B');
    expect(result.isMultiArtist).toBe(true);
    expect(result.artists).toHaveLength(2);
    expect(result.artists).toEqual(['Artist A', 'Artist B']);
  });

  // 6. test_artist_name_trimming
  it('should trim whitespace from artist names', () => {
    const result = parseArtistName('  Artist  ');
    expect(result.artists).toEqual(['Artist']);
    expect(result.primaryArtist).toBe('Artist');
  });

  // 7. test_empty_string
  it('should handle empty string input', () => {
    const result = parseArtistName('');
    expect(result.artists).toEqual([]);
    expect(result.primaryArtist).toBe('');
    expect(result.isMultiArtist).toBe(false);
  });

  // 8. test_complex_name_preserved
  it('should preserve known single artists like "Simon & Garfunkel"', () => {
    const result = parseArtistName('Simon & Garfunkel');
    expect(result.isMultiArtist).toBe(false);
    expect(result.artists).toEqual(['Simon & Garfunkel']);
    expect(result.primaryArtist).toBe('Simon & Garfunkel');
  });
});
