import { Album, Track, Playlist, Artist } from '../types';

export interface ServerConfig {
  url: string;
  username: string;
  password: string;
}

// Calculate album display size based on track count
function getAlbumSize(trackCount: number): Album['size'] {
  if (trackCount >= 20) return 'xl';      // Double albums, compilations
  if (trackCount >= 14) return 'large';   // Extended albums
  if (trackCount >= 8) return 'medium';   // Standard albums
  return 'small';                          // EPs, singles
}

interface SubsonicResponse<T> {
  'subsonic-response': {
    status: 'ok' | 'failed';
    version: string;
    type: string;
    serverVersion: string;
    openSubsonic: boolean;
    error?: { code: number; message: string };
  } & T;
}

// Generate a random salt for authentication
function generateSalt(): string {
  return Math.random().toString(36).substring(2, 12);
}

// Simple MD5 implementation for browser
async function md5(message: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hashBuffer = await crypto.subtle.digest('MD5', data).catch(() => null);

  // Fallback: use salt-based auth without hashing if MD5 not available
  if (!hashBuffer) {
    return message;
  }

  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export class SubsonicAPI {
  private config: ServerConfig;
  private clientName = 'Lumina';
  private apiVersion = '1.16.1';

  constructor(config: ServerConfig) {
    this.config = config;
  }

  private async buildUrl(endpoint: string, params: Record<string, string> = {}): Promise<string> {
    const url = new URL(`${this.config.url}/rest/${endpoint}`);
    const salt = generateSalt();

    // Try token-based auth (MD5), fallback to plain password
    let token: string;
    try {
      token = await md5(this.config.password + salt);
    } catch {
      // Fallback to plain password auth
      url.searchParams.set('p', this.config.password);
      url.searchParams.set('u', this.config.username);
      url.searchParams.set('v', this.apiVersion);
      url.searchParams.set('c', this.clientName);
      url.searchParams.set('f', 'json');
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.set(key, value);
      });
      return url.toString();
    }

    url.searchParams.set('u', this.config.username);
    url.searchParams.set('t', token);
    url.searchParams.set('s', salt);
    url.searchParams.set('v', this.apiVersion);
    url.searchParams.set('c', this.clientName);
    url.searchParams.set('f', 'json');

    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });

    return url.toString();
  }

  // Build URL for password auth (simpler, works with Navidrome)
  private buildSimpleUrl(endpoint: string, params: Record<string, string> = {}): string {
    const url = new URL(`${this.config.url}/rest/${endpoint}`);

    url.searchParams.set('u', this.config.username);
    url.searchParams.set('p', this.config.password);
    url.searchParams.set('v', this.apiVersion);
    url.searchParams.set('c', this.clientName);
    url.searchParams.set('f', 'json');

    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });

    return url.toString();
  }

  private async request<T>(endpoint: string, params: Record<string, string> = {}): Promise<T> {
    const url = this.buildSimpleUrl(endpoint, params);
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data: SubsonicResponse<T> = await response.json();

    if (data['subsonic-response'].status === 'failed') {
      throw new Error(data['subsonic-response'].error?.message || 'Unknown error');
    }

    return data['subsonic-response'] as T;
  }

  async ping(): Promise<boolean> {
    try {
      await this.request('ping');
      return true;
    } catch (error) {
      console.error('Ping failed:', error);
      return false;
    }
  }

  async getAlbums(type: 'newest' | 'random' | 'alphabeticalByName' | 'starred' = 'newest', size = 500): Promise<Album[]> {
    const allAlbums: Album[] = [];
    let offset = 0;

    while (true) {
      const data = await this.request<{ albumList2: { album?: any[] } }>('getAlbumList2', {
        type,
        size: size.toString(),
        offset: offset.toString(),
      });

      const albums = data.albumList2?.album || [];
      if (albums.length === 0) break;

      allAlbums.push(...albums.map((album: any) => ({
        id: album.id,
        title: album.name || album.title || 'Unknown Album',
        artist: album.artist || 'Unknown Artist',
        artistId: album.artistId,
        year: album.year?.toString(),
        trackCount: album.songCount || 0,
        format: 'FLAC' as const, // Navidrome doesn't expose format in album list
        size: getAlbumSize(album.songCount || 0),
        cover: this.getCoverArtUrl(album.coverArt || album.id),
      })));

      if (albums.length < size) break;
      offset += size;
    }

    return allAlbums;
  }

  async getAlbum(id: string): Promise<{ album: Album; tracks: Track[] }> {
    const data = await this.request<{ album: any }>('getAlbum', { id });
    const album = data.album;

    const tracks: Track[] = (album.song || []).map((song: any) => ({
      id: song.id,
      title: song.title || 'Unknown Track',
      artist: song.artist || album.artist || 'Unknown Artist',
      artistId: song.artistId || album.artistId,
      album: album.name || 'Unknown Album',
      duration: this.formatDuration(song.duration),
      bitrate: song.bitRate ? `${song.bitRate} kbps` : 'Unknown',
      format: song.suffix?.toUpperCase() || 'Unknown',
      liked: song.starred !== undefined,
      cover: this.getCoverArtUrl(song.coverArt || album.coverArt || album.id),
    }));

    return {
      album: {
        id: album.id,
        title: album.name || 'Unknown Album',
        artist: album.artist || 'Unknown Artist',
        artistId: album.artistId,
        year: album.year?.toString(),
        trackCount: album.songCount || tracks.length,
        format: 'FLAC' as const,
        size: getAlbumSize(album.songCount || tracks.length),
        cover: this.getCoverArtUrl(album.coverArt || album.id),
      },
      tracks,
    };
  }

  async getArtists(): Promise<Artist[]> {
    const data = await this.request<{ artists: { index?: any[] } }>('getArtists');
    const indexes = data.artists?.index || [];

    const artists: Artist[] = [];
    for (const index of indexes) {
      const indexArtists = index.artist || [];
      for (const artist of indexArtists) {
        artists.push({
          id: artist.id,
          name: artist.name || 'Unknown Artist',
          genre: '', // Not provided in basic artist list
          albumCount: artist.albumCount || 0,
          cover: this.getCoverArtUrl(artist.coverArt || artist.id),
          desc: '', // Would need separate API call for bio
        });
      }
    }

    return artists;
  }

  async getArtist(id: string): Promise<{ artist: Artist; albums: Album[] }> {
    const data = await this.request<{ artist: any }>('getArtist', { id });
    const artist = data.artist;

    const albums: Album[] = (artist.album || []).map((album: any) => ({
      id: album.id,
      title: album.name || 'Unknown Album',
      artist: artist.name || 'Unknown Artist',
      artistId: artist.id,
      year: album.year?.toString(),
      trackCount: album.songCount || 0,
      format: 'FLAC' as const,
      size: getAlbumSize(album.songCount || 0),
      cover: this.getCoverArtUrl(album.coverArt || album.id),
    }));

    return {
      artist: {
        id: artist.id,
        name: artist.name || 'Unknown Artist',
        genre: '',
        albumCount: artist.albumCount || albums.length,
        cover: this.getCoverArtUrl(artist.coverArt || artist.id),
        desc: '',
      },
      albums,
    };
  }

  async getPlaylists(): Promise<Playlist[]> {
    const data = await this.request<{ playlists: { playlist?: any[] } }>('getPlaylists');
    const playlists = data.playlists?.playlist || [];

    return playlists.map((playlist: any) => ({
      id: playlist.id,
      title: playlist.name || 'Unknown Playlist',
      cover: this.getCoverArtUrl(playlist.coverArt || playlist.id),
      desc: playlist.comment || '',
      count: playlist.songCount || 0,
    }));
  }

  async getPlaylist(id: string): Promise<{ playlist: Playlist; tracks: Track[] }> {
    const data = await this.request<{ playlist: any }>('getPlaylist', { id });
    const playlist = data.playlist;

    const tracks: Track[] = (playlist.entry || []).map((song: any) => ({
      id: song.id,
      title: song.title || 'Unknown Track',
      artist: song.artist || 'Unknown Artist',
      artistId: song.artistId,
      album: song.album || 'Unknown Album',
      duration: this.formatDuration(song.duration),
      bitrate: song.bitRate ? `${song.bitRate} kbps` : 'Unknown',
      format: song.suffix?.toUpperCase() || 'Unknown',
      liked: song.starred !== undefined,
      cover: this.getCoverArtUrl(song.coverArt || song.id),
    }));

    return {
      playlist: {
        id: playlist.id,
        title: playlist.name || 'Unknown Playlist',
        cover: this.getCoverArtUrl(playlist.coverArt || playlist.id),
        desc: playlist.comment || '',
        count: playlist.songCount || tracks.length,
      },
      tracks,
    };
  }

  async updatePlaylist(id: string, name?: string, comment?: string): Promise<void> {
    const params: Record<string, string> = { playlistId: id };
    if (name) params.name = name;
    if (comment) params.comment = comment;
    await this.request('updatePlaylist', params);
  }

  async getRandomSongs(size = 20): Promise<Track[]> {
    const data = await this.request<{ randomSongs: { song?: any[] } }>('getRandomSongs', {
      size: size.toString(),
    });

    const songs = data.randomSongs?.song || [];

    return songs.map((song: any) => ({
      id: song.id,
      title: song.title || 'Unknown Track',
      artist: song.artist || 'Unknown Artist',
      artistId: song.artistId,
      album: song.album || 'Unknown Album',
      duration: this.formatDuration(song.duration),
      bitrate: song.bitRate ? `${song.bitRate} kbps` : 'Unknown',
      format: song.suffix?.toUpperCase() || 'Unknown',
      liked: song.starred !== undefined,
      cover: this.getCoverArtUrl(song.coverArt || song.id),
    }));
  }

  async star(id: string, type: 'song' | 'album' | 'artist' = 'song'): Promise<void> {
    const params: Record<string, string> = {};
    if (type === 'album') {
      params.albumId = id;
    } else if (type === 'artist') {
      params.artistId = id;
    } else {
      params.id = id;
    }
    await this.request('star', params);
  }

  async unstar(id: string, type: 'song' | 'album' | 'artist' = 'song'): Promise<void> {
    const params: Record<string, string> = {};
    if (type === 'album') {
      params.albumId = id;
    } else if (type === 'artist') {
      params.artistId = id;
    } else {
      params.id = id;
    }
    await this.request('unstar', params);
  }

  async getStarred(): Promise<{ songs: Track[]; albums: Album[] }> {
    const data = await this.request<{ starred2: { song?: any[]; album?: any[] } }>('getStarred2');
    const starred = data.starred2 || {};

    const songs: Track[] = (starred.song || []).map((song: any) => ({
      id: song.id,
      title: song.title || 'Unknown Track',
      artist: song.artist || 'Unknown Artist',
      artistId: song.artistId,
      album: song.album || 'Unknown Album',
      duration: this.formatDuration(song.duration),
      bitrate: song.bitRate ? `${song.bitRate} kbps` : 'Unknown',
      format: song.suffix?.toUpperCase() || 'Unknown',
      liked: true,
      cover: this.getCoverArtUrl(song.coverArt || song.id),
    }));

    const albums: Album[] = (starred.album || []).map((album: any) => ({
      id: album.id,
      title: album.name || album.title || 'Unknown Album',
      artist: album.artist || 'Unknown Artist',
      artistId: album.artistId,
      year: album.year?.toString(),
      trackCount: album.songCount || 0,
      format: 'FLAC' as const,
      size: getAlbumSize(album.songCount || 0),
      cover: this.getCoverArtUrl(album.coverArt || album.id),
    }));

    return { songs, albums };
  }

  getCoverArtUrl(id: string, size = 300): string {
    const url = new URL(`${this.config.url}/rest/getCoverArt`);
    url.searchParams.set('id', id);
    url.searchParams.set('size', size.toString());
    url.searchParams.set('u', this.config.username);
    url.searchParams.set('p', this.config.password);
    url.searchParams.set('v', this.apiVersion);
    url.searchParams.set('c', this.clientName);
    return url.toString();
  }

  getStreamUrl(id: string): string {
    const url = new URL(`${this.config.url}/rest/stream`);
    url.searchParams.set('id', id);
    url.searchParams.set('u', this.config.username);
    url.searchParams.set('p', this.config.password);
    url.searchParams.set('v', this.apiVersion);
    url.searchParams.set('c', this.clientName);
    return url.toString();
  }

  async getLyrics(artist: string, title: string): Promise<string | null> {
    try {
      const data = await this.request<{ lyrics?: { value?: string } }>('getLyrics', {
        artist,
        title,
      });
      return data.lyrics?.value || null;
    } catch (error) {
      console.error('Failed to fetch lyrics:', error);
      return null;
    }
  }

  async search(query: string): Promise<{ songs: Track[]; albums: Album[]; artists: Artist[] }> {
    if (!query.trim()) {
      return { songs: [], albums: [], artists: [] };
    }

    const data = await this.request<{
      searchResult3: {
        song?: any[];
        album?: any[];
        artist?: any[];
      };
    }>('search3', {
      query,
      songCount: '20',
      albumCount: '10',
      artistCount: '10',
    });

    const result = data.searchResult3 || {};

    const songs: Track[] = (result.song || []).map((song: any) => ({
      id: song.id,
      title: song.title || 'Unknown Track',
      artist: song.artist || 'Unknown Artist',
      artistId: song.artistId,
      album: song.album || 'Unknown Album',
      duration: this.formatDuration(song.duration),
      bitrate: song.bitRate ? `${song.bitRate} kbps` : 'Unknown',
      format: song.suffix?.toUpperCase() || 'Unknown',
      liked: song.starred !== undefined,
      cover: this.getCoverArtUrl(song.coverArt || song.id),
    }));

    const albums: Album[] = (result.album || []).map((album: any) => ({
      id: album.id,
      title: album.name || album.title || 'Unknown Album',
      artist: album.artist || 'Unknown Artist',
      artistId: album.artistId,
      year: album.year?.toString(),
      trackCount: album.songCount || 0,
      format: 'FLAC' as const,
      size: getAlbumSize(album.songCount || 0),
      cover: this.getCoverArtUrl(album.coverArt || album.id),
    }));

    const artists: Artist[] = (result.artist || []).map((artist: any) => ({
      id: artist.id,
      name: artist.name || 'Unknown Artist',
      genre: '',
      albumCount: artist.albumCount || 0,
      cover: this.getCoverArtUrl(artist.coverArt || artist.id),
      desc: '',
    }));

    return { songs, albums, artists };
  }

  private formatDuration(seconds?: number): string {
    if (!seconds) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
}
