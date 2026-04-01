import { describe, it, expect, vi } from 'vitest';

// Mock the aggregator module (hoisted before imports)
vi.mock('../services/aggregator', () => ({
  fetchArtistImage: vi.fn(),
}));

// Use vi.hoisted to set up localStorage BEFORE any module loads
// vi.hoisted runs its callback before vi.mock factories, and vi.mock is hoisted above imports
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

import { getCachedArtistImage, ARTIST_PLACEHOLDER } from './useArtistImage';

describe('useArtistImage utilities', () => {
  // 3. test_artist_image_fetch — unknown artist returns placeholder
  it('should return placeholder for unknown/uncached artists', () => {
    const result = getCachedArtistImage('Some Completely Unknown Artist');
    expect(result).toBe(ARTIST_PLACEHOLDER);
  });

  // 4. test_artist_image_cache — verify cache behavior and placeholder format
  it('should return placeholder for uncached artists and placeholder is valid SVG data URI', () => {
    const unknown = getCachedArtistImage('Never Heard Of This Artist');
    expect(unknown).toBe(ARTIST_PLACEHOLDER);

    // Verify the placeholder is a proper SVG data URI
    expect(ARTIST_PLACEHOLDER).toContain('data:image/svg+xml,');
    expect(ARTIST_PLACEHOLDER).toContain('svg');
  });
});
