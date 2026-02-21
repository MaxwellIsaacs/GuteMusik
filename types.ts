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

export interface PluginViewProps {
  onPlayTrack: (track: Track, queue?: Track[]) => void;
  onNavigateToAlbum: (id: string) => void;
  onNavigateToArtist: (id: string) => void;
  onContextMenu: (e: React.MouseEvent, item: any, type: string) => void;
  onToast: (msg: string) => void;
  // Server context for plugins that need it
  serverState: ServerState;
  refreshAlbums: () => Promise<void>;
  refreshArtists: () => Promise<void>;
}

export interface PluginDefinition {
  id: string;
  label: string;
  icon: ChromeIconName | React.FC<{ size: number; className?: string }>;
  view: React.FC<PluginViewProps>;
}
