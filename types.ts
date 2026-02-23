import React, { ReactNode } from 'react';
import { ChromeIconName } from './components/ChromeIcon';

export interface Track {
  id: string;
  title: string;
  artist: string;
  artistId?: string;
  album: string;
  albumId?: string;
  duration: string;
  bitrate: string;
  format: string;
  liked: boolean;
  cover?: string;
}

export interface Album {
  id: string;
  title: string;
  artist: string;
  artistId?: string;
  year?: string;
  trackCount: number;
  format: 'FLAC' | '320kbps' | '192kbps' | 'OPUS';
  size: 'xl' | 'large' | 'medium' | 'small';
  cover: string;
}

export interface Playlist {
  id: string;
  title: string;
  cover: string;
  desc: string;
  count: number;
}

export interface Artist {
    id: string;
    name: string;
    genre: string;
    albumCount: number;
    cover: string;
    desc: string;
}

export interface NavItem {
  id: string;
  label: string;
  icon: ReactNode;
}

export interface ContextMenuState {
  x: number;
  y: number;
  type: string;
  item: any;
}

export type ViewState = 'Library' | 'Playlists' | 'Queue' | 'Artist' | 'Album' | 'Settings' | `Plugin:${string}`;

export interface ServerState {
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  serverUrl: string | null;
}

/** @deprecated Use usePluginAPI() hook instead. Kept for backward compatibility with external plugins. */
export interface PluginViewProps {
  onPlayTrack: (track: Track, queue?: Track[]) => void;
  onNavigateToAlbum: (id: string) => void;
  onNavigateToArtist: (id: string) => void;
  onContextMenu: (e: React.MouseEvent, item: any, type: string) => void;
  onToast: (msg: string) => void;
  serverState: ServerState;
  refreshAlbums: () => Promise<void>;
  refreshArtists: () => Promise<void>;
}

// ─── Plugin Host API ──────────────────────────────────────────

export interface PluginAudioAPI {
  state: {
    currentTrack: Track | null;
    isPlaying: boolean;
    currentTime: number;
    duration: number;
    volume: number;
    isMuted: boolean;
    isLoading: boolean;
    error: string | null;
  };
  playTrack: (track: Track, queue?: Track[]) => void;
  pause: () => void;
  resume: () => void;
  togglePlay: () => void;
  next: () => void;
  previous: () => void;
  seek: (time: number) => void;
  seekPercent: (percent: number) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  isShuffled: boolean;
  repeatMode: 'off' | 'all' | 'one';
  toggleShuffle: () => void;
  cycleRepeat: () => void;
}

export interface PluginLibraryAPI {
  serverState: ServerState;
  albums: Album[];
  artists: Artist[];
  playlists: Playlist[];
  starredTracks: Track[];
  starredAlbums: Album[];
  queueTracks: Track[];
  refreshAlbums: () => Promise<void>;
  refreshArtists: () => Promise<void>;
  refreshPlaylists: () => Promise<void>;
  refreshAll: () => Promise<void>;
  refreshStarred: () => Promise<void>;
  addToQueue: (track: Track) => void;
  toggleStar: (id: string, type: 'song' | 'album', currentlyStarred: boolean) => Promise<boolean>;
  search: (query: string) => Promise<void>;
  clearSearch: () => void;
  searchQuery: string;
  searchResults: { songs: Track[]; albums: Album[]; artists: Artist[] };
  isSearching: boolean;
}

export interface PluginNavAPI {
  navigateToAlbum: (id: string) => void;
  navigateToArtist: (id: string) => void;
}

export interface PluginUIAPI {
  toast: (msg: string) => void;
  contextMenu: (e: React.MouseEvent, item: any, type: string) => void;
}

export interface PluginStorageAPI {
  get: <T = unknown>(key: string) => T | null;
  set: (key: string, value: unknown) => void;
  remove: (key: string) => void;
}

export interface PluginIpcAPI {
  invoke: <T = unknown>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
  listen: <T = unknown>(event: string, handler: (payload: T) => void) => Promise<() => void>;
}

export interface PluginHostAPI {
  pluginId: string;
  audio: PluginAudioAPI;
  library: PluginLibraryAPI;
  nav: PluginNavAPI;
  ui: PluginUIAPI;
  storage: PluginStorageAPI;
  ipc: PluginIpcAPI;
}

export interface PluginDefinition {
  id: string;
  label: string;
  icon: ChromeIconName | React.FC<{ size: number; className?: string }>;
  view: React.FC;
  settings?: React.FC;
  init?: (api: PluginHostAPI) => void | (() => void);
  cleanup?: () => void;
}
