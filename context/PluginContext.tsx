import React, { createContext, useContext, useMemo, ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen as tauriListen } from '@tauri-apps/api/event';
import { useAudio } from './AudioContext';
import { useServer } from './ServerContext';
import { PluginHostAPI, PluginStorageAPI, PluginIpcAPI } from '../types';

interface PluginProviderProps {
  pluginId: string;
  navigateToAlbum: (id: string) => void;
  navigateToArtist: (id: string) => void;
  toast: (msg: string) => void;
  contextMenu: (e: React.MouseEvent, item: any, type: string) => void;
  children: ReactNode;
}

const PluginContext = createContext<PluginHostAPI | null>(null);

export function PluginProvider({
  pluginId,
  navigateToAlbum,
  navigateToArtist,
  toast,
  contextMenu,
  children,
}: PluginProviderProps) {
  const audio = useAudio();
  const server = useServer();

  const storage: PluginStorageAPI = useMemo(() => {
    const prefix = `gutemusik:plugin:${pluginId}:`;
    return {
      get: <T = unknown,>(key: string): T | null => {
        try {
          const raw = localStorage.getItem(prefix + key);
          return raw !== null ? JSON.parse(raw) : null;
        } catch {
          return null;
        }
      },
      set: (key: string, value: unknown) => {
        localStorage.setItem(prefix + key, JSON.stringify(value));
      },
      remove: (key: string) => {
        localStorage.removeItem(prefix + key);
      },
    };
  }, [pluginId]);

  const ipc: PluginIpcAPI = useMemo(() => ({
    invoke: <T = unknown,>(cmd: string, args?: Record<string, unknown>) =>
      invoke<T>(cmd, args),
    listen: async <T = unknown,>(event: string, handler: (payload: T) => void) => {
      const unlisten = await tauriListen<T>(event, (e) => handler(e.payload));
      return unlisten;
    },
  }), []);

  const api: PluginHostAPI = useMemo(() => ({
    pluginId,
    audio: {
      state: audio.state,
      playTrack: audio.playTrack,
      pause: audio.pause,
      resume: audio.resume,
      togglePlay: audio.togglePlay,
      next: audio.next,
      previous: audio.previous,
      seek: audio.seek,
      seekPercent: audio.seekPercent,
      setVolume: audio.setVolume,
      toggleMute: audio.toggleMute,
      isShuffled: audio.isShuffled,
      repeatMode: audio.repeatMode,
      toggleShuffle: audio.toggleShuffle,
      cycleRepeat: audio.cycleRepeat,
    },
    library: {
      serverState: server.state,
      albums: server.albums,
      artists: server.artists,
      playlists: server.playlists,
      starredTracks: server.starredTracks,
      starredAlbums: server.starredAlbums,
      queueTracks: server.queueTracks,
      refreshAlbums: server.refreshAlbums,
      refreshArtists: server.refreshArtists,
      refreshPlaylists: server.refreshPlaylists,
      refreshAll: server.refreshAll,
      refreshStarred: server.refreshStarred,
      addToQueue: server.addToQueue,
      toggleStar: server.toggleStar,
      search: server.search,
      clearSearch: server.clearSearch,
      searchQuery: server.searchQuery,
      searchResults: server.searchResults,
      isSearching: server.isSearching,
    },
    nav: { navigateToAlbum, navigateToArtist },
    ui: { toast, contextMenu },
    storage,
    ipc,
  }), [
    pluginId, audio, server,
    navigateToAlbum, navigateToArtist, toast, contextMenu,
    storage, ipc,
  ]);

  return (
    <PluginContext.Provider value={api}>
      {children}
    </PluginContext.Provider>
  );
}

export function usePluginAPI(): PluginHostAPI {
  const ctx = useContext(PluginContext);
  if (!ctx) {
    throw new Error('usePluginAPI must be used within a <PluginProvider>');
  }
  return ctx;
}
