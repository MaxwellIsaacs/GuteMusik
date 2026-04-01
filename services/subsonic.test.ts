import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SubsonicAPI, ServerConfig } from './subsonic';

const CONFIG = {
  url: 'http://example.com',
  username: 'user',
  password: 'pass',
};

/** Build a successful subsonic-response JSON body, merging `extra` into the response. */
function okResponse(extra: Record<string, unknown> = {}) {
  return {
    'subsonic-response': {
      status: 'ok' as const,
      version: '1.16.1',
      type: 'lumina',
      serverVersion: '1.0.0',
      openSubsonic: false,
      ...extra,
    },
  };
}

function failedResponse(message = 'error') {
  return {
    'subsonic-response': {
      status: 'failed' as const,
      version: '1.16.1',
      type: 'lumina',
      serverVersion: '1.0.0',
      openSubsonic: false,
      error: { code: 0, message },
    },
  };
}

/** Create a mock fetch that resolves with `body` and captures the URL. */
function mockFetch(body: unknown) {
  const calls: string[] = [];
  const mock = vi.fn(async (url: string | URL | Request) => {
    calls.push(url.toString());
    return {
      ok: true,
      json: async () => body,
    } as Response;
  });
  return { mock, calls };
}

describe('SubsonicAPI', () => {
  let originalFetch: typeof globalThis.fetch;
  let originalDigest: typeof crypto.subtle.digest;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    originalDigest = crypto.subtle.digest.bind(crypto.subtle);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    // Restore digest — redefine it since we may have replaced the whole subtle object
    try {
      Object.defineProperty(crypto.subtle, 'digest', {
        value: originalDigest,
        writable: true,
        configurable: true,
      });
    } catch {
      // ignore if already restored
    }
    vi.restoreAllMocks();
  });

  // ─── 1. MD5 token auth ───────────────────────────────────────────
  it('test_auth_params_md5', async () => {
    // Ensure crypto.subtle.digest succeeds and returns a fake hash buffer
    // (Node.js WebCrypto may not support MD5, so we mock it)
    const fakeHash = new Uint8Array(16).fill(0xab);
    Object.defineProperty(crypto.subtle, 'digest', {
      value: () => Promise.resolve(fakeHash.buffer),
      writable: true,
      configurable: true,
    });

    const { mock, calls } = mockFetch(okResponse());
    globalThis.fetch = mock;

    const api = new SubsonicAPI(CONFIG);
    await api.ping();

    expect(calls.length).toBeGreaterThanOrEqual(1);
    const url = new URL(calls[0]);
    expect(url.searchParams.get('u')).toBe('user');
    expect(url.searchParams.has('t')).toBe(true);
    expect(url.searchParams.has('s')).toBe(true);
    expect(url.searchParams.has('p')).toBe(false);
    expect(url.searchParams.get('v')).toBe('1.16.1');
    expect(url.searchParams.get('c')).toBe('Lumina');
    expect(url.searchParams.get('f')).toBe('json');
  });

  // ─── 2. Plaintext fallback when MD5 unavailable ──────────────────
  it('test_auth_params_plaintext_fallback', async () => {
    // Make crypto.subtle.digest throw
    Object.defineProperty(crypto.subtle, 'digest', {
      value: () => Promise.reject(new Error('MD5 not supported')),
      writable: true,
      configurable: true,
    });

    const { mock, calls } = mockFetch(okResponse());
    globalThis.fetch = mock;

    const api = new SubsonicAPI(CONFIG);
    await api.ping();

    expect(calls.length).toBeGreaterThanOrEqual(1);
    const url = new URL(calls[0]);
    expect(url.searchParams.get('u')).toBe('user');
    expect(url.searchParams.get('p')).toBe('pass');
    expect(url.searchParams.has('t')).toBe(false);
    expect(url.searchParams.has('s')).toBe(false);
  });

  // ─── 3. getAlbums URL ────────────────────────────────────────────
  it('test_get_albums_url', async () => {
    const { mock, calls } = mockFetch(
      okResponse({ albumList2: { album: [] } }),
    );
    globalThis.fetch = mock;

    const api = new SubsonicAPI(CONFIG);
    await api.getAlbums('newest', 50);

    expect(calls.length).toBeGreaterThanOrEqual(1);
    const url = new URL(calls[0]);
    expect(url.pathname).toBe('/rest/getAlbumList2');
    expect(url.searchParams.get('type')).toBe('newest');
    expect(url.searchParams.get('size')).toBe('50');
    expect(url.searchParams.get('offset')).toBe('0');
  });

  // ─── 4. getAlbums pagination ─────────────────────────────────────
  it('test_get_albums_pagination', async () => {
    const page1Albums = Array.from({ length: 5 }, (_, i) => ({
      id: `a${i}`,
      name: `Album ${i}`,
      artist: 'Artist',
      songCount: 10,
    }));
    const page2Albums = [
      { id: 'a5', name: 'Album 5', artist: 'Artist', songCount: 10 },
    ];

    let callCount = 0;
    const calls: string[] = [];
    globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
      calls.push(url.toString());
      callCount++;
      const body =
        callCount === 1
          ? okResponse({ albumList2: { album: page1Albums } })
          : okResponse({ albumList2: { album: page2Albums } });
      return { ok: true, json: async () => body } as Response;
    });

    const api = new SubsonicAPI(CONFIG);
    const albums = await api.getAlbums('newest', 5);

    // Should have made 2 fetch calls
    expect(calls.length).toBe(2);
    // Second call should have offset=5
    const url2 = new URL(calls[1]);
    expect(url2.searchParams.get('offset')).toBe('5');
    // Should return all 6 albums
    expect(albums.length).toBe(6);
  });

  // ─── 5. getAlbum URL ─────────────────────────────────────────────
  it('test_get_album_url', async () => {
    const { mock, calls } = mockFetch(
      okResponse({
        album: {
          id: 'al-1',
          name: 'Test Album',
          artist: 'Artist',
          songCount: 2,
          song: [],
        },
      }),
    );
    globalThis.fetch = mock;

    const api = new SubsonicAPI(CONFIG);
    await api.getAlbum('al-1');

    const url = new URL(calls[0]);
    expect(url.pathname).toBe('/rest/getAlbum');
    expect(url.searchParams.get('id')).toBe('al-1');
  });

  // ─── 6. getArtist URL ────────────────────────────────────────────
  it('test_get_artist_url', async () => {
    const { mock, calls } = mockFetch(
      okResponse({
        artist: {
          id: 'ar-1',
          name: 'Test Artist',
          albumCount: 0,
          album: [],
        },
      }),
    );
    globalThis.fetch = mock;

    const api = new SubsonicAPI(CONFIG);
    await api.getArtist('ar-1');

    const url = new URL(calls[0]);
    expect(url.pathname).toBe('/rest/getArtist');
    expect(url.searchParams.get('id')).toBe('ar-1');
  });

  // ─── 7. getArtists URL ───────────────────────────────────────────
  it('test_get_artists_url', async () => {
    const { mock, calls } = mockFetch(
      okResponse({ artists: { index: [] } }),
    );
    globalThis.fetch = mock;

    const api = new SubsonicAPI(CONFIG);
    await api.getArtists();

    const url = new URL(calls[0]);
    expect(url.pathname).toBe('/rest/getArtists');
  });

  // ─── 8. search URL ───────────────────────────────────────────────
  it('test_search_url', async () => {
    const { mock, calls } = mockFetch(
      okResponse({ searchResult3: {} }),
    );
    globalThis.fetch = mock;

    const api = new SubsonicAPI(CONFIG);
    await api.search('hello');

    const url = new URL(calls[0]);
    expect(url.pathname).toBe('/rest/search3');
    expect(url.searchParams.get('query')).toBe('hello');
    expect(url.searchParams.get('songCount')).toBe('20');
    expect(url.searchParams.get('albumCount')).toBe('10');
    expect(url.searchParams.get('artistCount')).toBe('10');
  });

  // ─── 9. getPlaylists URL ─────────────────────────────────────────
  it('test_get_playlists_url', async () => {
    const { mock, calls } = mockFetch(
      okResponse({ playlists: { playlist: [] } }),
    );
    globalThis.fetch = mock;

    const api = new SubsonicAPI(CONFIG);
    await api.getPlaylists();

    const url = new URL(calls[0]);
    expect(url.pathname).toBe('/rest/getPlaylists');
  });

  // ─── 10. createPlaylist URL ───────────────────────────────────────
  it('test_create_playlist_url', async () => {
    const { mock, calls } = mockFetch(
      okResponse({
        playlist: { id: 'pl-1', name: 'My List', songCount: 0 },
      }),
    );
    globalThis.fetch = mock;

    const api = new SubsonicAPI(CONFIG);
    await api.createPlaylist('My List');

    const url = new URL(calls[0]);
    expect(url.pathname).toBe('/rest/createPlaylist');
    expect(url.searchParams.get('name')).toBe('My List');
  });

  // ─── 11. addToPlaylist URL ────────────────────────────────────────
  it('test_add_to_playlist_url', async () => {
    const { mock, calls } = mockFetch(okResponse());
    globalThis.fetch = mock;

    const api = new SubsonicAPI(CONFIG);
    await api.addToPlaylist('pl-1', ['s1', 's2']);

    const url = new URL(calls[0]);
    expect(url.pathname).toBe('/rest/updatePlaylist');
    expect(url.searchParams.get('playlistId')).toBe('pl-1');
    expect(url.searchParams.getAll('songIdToAdd')).toEqual(['s1', 's2']);
  });

  // ─── 12. star URL ────────────────────────────────────────────────
  it('test_star_url', async () => {
    const { mock, calls } = mockFetch(okResponse());
    globalThis.fetch = mock;

    const api = new SubsonicAPI(CONFIG);
    await api.star('song-1');

    const url = new URL(calls[0]);
    expect(url.pathname).toBe('/rest/star');
    expect(url.searchParams.get('id')).toBe('song-1');
  });

  // ─── 13. unstar URL ──────────────────────────────────────────────
  it('test_unstar_url', async () => {
    const { mock, calls } = mockFetch(okResponse());
    globalThis.fetch = mock;

    const api = new SubsonicAPI(CONFIG);
    await api.unstar('song-1');

    const url = new URL(calls[0]);
    expect(url.pathname).toBe('/rest/unstar');
    expect(url.searchParams.get('id')).toBe('song-1');
  });

  // ─── 14. getLyrics URL ────────────────────────────────────────────
  it('test_get_lyrics_url', async () => {
    const { mock, calls } = mockFetch(
      okResponse({ lyrics: { value: 'la la la' } }),
    );
    globalThis.fetch = mock;

    const api = new SubsonicAPI(CONFIG);
    await api.getLyrics('Radiohead', 'Creep');

    const url = new URL(calls[0]);
    expect(url.pathname).toBe('/rest/getLyrics');
    expect(url.searchParams.get('artist')).toBe('Radiohead');
    expect(url.searchParams.get('title')).toBe('Creep');
  });

  // ─── 15. getCoverArtUrl ───────────────────────────────────────────
  it('test_cover_art_url', () => {
    const api = new SubsonicAPI(CONFIG);
    const urlStr = api.getCoverArtUrl('cover-1', 500);
    const url = new URL(urlStr);

    expect(url.pathname).toBe('/rest/getCoverArt');
    expect(url.searchParams.get('id')).toBe('cover-1');
    expect(url.searchParams.get('size')).toBe('500');
    // buildSimpleUrl always uses plaintext auth
    expect(url.searchParams.get('u')).toBe('user');
    expect(url.searchParams.get('p')).toBe('pass');
    expect(url.searchParams.get('v')).toBe('1.16.1');
    expect(url.searchParams.get('c')).toBe('Lumina');
    expect(url.searchParams.get('f')).toBe('json');
  });

  // ─── 16. getStreamUrl ─────────────────────────────────────────────
  it('test_stream_url', () => {
    const api = new SubsonicAPI(CONFIG);
    const urlStr = api.getStreamUrl('track-42');
    const url = new URL(urlStr);

    expect(url.pathname).toBe('/rest/stream');
    expect(url.searchParams.get('id')).toBe('track-42');
    expect(url.searchParams.get('u')).toBe('user');
    expect(url.searchParams.get('p')).toBe('pass');
  });

  // ─── 17. ping success ────────────────────────────────────────────
  it('test_ping_success', async () => {
    const { mock } = mockFetch(okResponse());
    globalThis.fetch = mock;

    const api = new SubsonicAPI(CONFIG);
    const result = await api.ping();
    expect(result).toBe(true);
  });

  // ─── 18. ping failure ────────────────────────────────────────────
  it('test_ping_failure', async () => {
    vi.useFakeTimers();
    const { mock } = mockFetch(failedResponse('auth failed'));
    globalThis.fetch = mock;

    const api = new SubsonicAPI(CONFIG);
    const pingPromise = api.ping();

    // Advance past all retry backoff delays (500ms, 1000ms, 2000ms)
    await vi.advanceTimersByTimeAsync(4000);

    const result = await pingPromise;
    expect(result).toBe(false);
    vi.useRealTimers();
  });
});
