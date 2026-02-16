import { ReactNode } from 'react';

export interface Track {
  id: string;
  title: string;
  artist: string;
  artistId?: string;
  album: string;
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

export type ViewState = 'Library' | 'Playlists' | 'Queue' | 'Artist' | 'Album' | 'Settings';