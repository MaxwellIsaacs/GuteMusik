import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';
import { SubsonicAPI, ServerConfig } from '../services/subsonic';
import { Album, Track, Playlist, Artist } from '../types';

interface ServerState {
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  serverUrl: string | null;
}

interface SearchResults {
  songs: Track[];
  albums: Album[];
  artists: Artist[];
}

interface ServerContextType {
  // Connection state
  state: ServerState;
  api: SubsonicAPI | null;

  // Actions
  connect: (config: ServerConfig) => Promise<boolean>;
  disconnect: () => void;

  // Data
  albums: Album[];
  artists: Artist[];
  playlists: Playlist[];
  queueTracks: Track[];

  // Data loading states
  isLoadingAlbums: boolean;
  isLoadingArtists: boolean;
  isLoadingPlaylists: boolean;

  // Data fetching
  refreshAlbums: () => Promise<void>;
  refreshArtists: () => Promise<void>;
  refreshPlaylists: () => Promise<void>;
  refreshAll: () => Promise<void>;

  // Queue management
  setQueueTracks: (tracks: Track[]) => void;
  addToQueue: (track: Track) => void;

  // Playlist management
  updatePlaylistInfo: (id: string, name?: string, description?: string) => Promise<void>;

  // Favorites
  starredTracks: Track[];
  starredAlbums: Album[];
  isLoadingStarred: boolean;
  refreshStarred: () => Promise<void>;
  toggleStar: (id: string, type: 'song' | 'album', currentlyStarred: boolean) => Promise<boolean>;

  // Search
  searchQuery: string;
  searchResults: SearchResults;
  isSearching: boolean;
  search: (query: string) => Promise<void>;
  clearSearch: () => void;
}

const ServerContext = createContext<ServerContextType | null>(null);

const STORAGE_KEY = 'lumina-server-config';

export function ServerProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ServerState>({
    isConnected: false,
    isConnecting: false,
    error: null,
    serverUrl: null,
  });

  const [api, setApi] = useState<SubsonicAPI | null>(null);

  // Data state
  const [albums, setAlbums] = useState<Album[]>([]);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [queueTracks, setQueueTracks] = useState<Track[]>([]);

  // Loading states
  const [isLoadingAlbums, setIsLoadingAlbums] = useState(false);
  const [isLoadingArtists, setIsLoadingArtists] = useState(false);
  const [isLoadingPlaylists, setIsLoadingPlaylists] = useState(false);
  const [isLoadingStarred, setIsLoadingStarred] = useState(false);

  // Starred/Favorites state
  const [starredTracks, setStarredTracks] = useState<Track[]>([]);
  const [starredAlbums, setStarredAlbums] = useState<Album[]>([]);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResults>({ songs: [], albums: [], artists: [] });
  const [isSearching, setIsSearching] = useState(false);

  // Connect to server
  const connect = useCallback(async (config: ServerConfig): Promise<boolean> => {
    setState(prev => ({ ...prev, isConnecting: true, error: null }));

    try {
      const newApi = new SubsonicAPI(config);
      const success = await newApi.ping();

      if (success) {
        setApi(newApi);
        setState({
          isConnected: true,
          isConnecting: false,
          error: null,
          serverUrl: config.url,
        });

        // Save config to localStorage
        localStorage.setItem(STORAGE_KEY, JSON.stringify(config));

        return true;
      } else {
        setState(prev => ({
          ...prev,
          isConnecting: false,
          error: 'Failed to connect to server',
        }));
        return false;
      }
    } catch (error) {
      setState(prev => ({
        ...prev,
        isConnecting: false,
        error: error instanceof Error ? error.message : 'Connection failed',
      }));
      return false;
    }
  }, []);

  // Disconnect from server
  const disconnect = useCallback(() => {
    setApi(null);
    setAlbums([]);
    setArtists([]);
    setPlaylists([]);
    setQueueTracks([]);
    setStarredTracks([]);
    setStarredAlbums([]);
    setSearchQuery('');
    setSearchResults({ songs: [], albums: [], artists: [] });
    setState({
      isConnected: false,
      isConnecting: false,
      error: null,
      serverUrl: null,
    });
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  // Fetch albums
  const refreshAlbums = useCallback(async () => {
    if (!api) return;
    setIsLoadingAlbums(true);
    try {
      const data = await api.getAlbums('newest');
      setAlbums(data);
    } catch (error) {
      console.error('Failed to fetch albums:', error);
    } finally {
      setIsLoadingAlbums(false);
    }
  }, [api]);

  // Fetch artists
  const refreshArtists = useCallback(async () => {
    if (!api) return;
    setIsLoadingArtists(true);
    try {
      const data = await api.getArtists();
      setArtists(data);
    } catch (error) {
      console.error('Failed to fetch artists:', error);
    } finally {
      setIsLoadingArtists(false);
    }
  }, [api]);

  // Fetch playlists
  const refreshPlaylists = useCallback(async () => {
    if (!api) return;
    setIsLoadingPlaylists(true);
    try {
      const data = await api.getPlaylists();
      setPlaylists(data);
    } catch (error) {
      console.error('Failed to fetch playlists:', error);
    } finally {
      setIsLoadingPlaylists(false);
    }
  }, [api]);

  // Fetch starred/favorites
  const refreshStarred = useCallback(async () => {
    if (!api) return;
    setIsLoadingStarred(true);
    try {
      const data = await api.getStarred();
      setStarredTracks(data.songs);
      setStarredAlbums(data.albums);
    } catch (error) {
      console.error('Failed to fetch starred:', error);
    } finally {
      setIsLoadingStarred(false);
    }
  }, [api]);

  // Refresh all data
  const refreshAll = useCallback(async () => {
    await Promise.all([refreshAlbums(), refreshArtists(), refreshPlaylists(), refreshStarred()]);
  }, [refreshAlbums, refreshArtists, refreshPlaylists, refreshStarred]);

  // Add track to queue
  const addToQueue = useCallback((track: Track) => {
    setQueueTracks(prev => [...prev, track]);
  }, []);

  // Update playlist info (name and/or description)
  const updatePlaylistInfo = useCallback(async (id: string, name?: string, description?: string) => {
    if (!api) return;
    try {
      await api.updatePlaylist(id, name, description);
      await refreshPlaylists();
    } catch (error) {
      console.error('Failed to update playlist:', error);
      throw error;
    }
  }, [api, refreshPlaylists]);

  // Toggle star status for a song or album
  const toggleStar = useCallback(async (id: string, type: 'song' | 'album', currentlyStarred: boolean): Promise<boolean> => {
    if (!api) return false;
    try {
      if (currentlyStarred) {
        await api.unstar(id, type);
      } else {
        await api.star(id, type);
      }
      // Refresh starred list to reflect changes
      await refreshStarred();
      return true;
    } catch (error) {
      console.error('Failed to toggle star:', error);
      return false;
    }
  }, [api, refreshStarred]);

  // Search
  const search = useCallback(async (query: string) => {
    setSearchQuery(query);
    if (!query.trim()) {
      setSearchResults({ songs: [], albums: [], artists: [] });
      return;
    }
    if (!api) return;
    setIsSearching(true);
    try {
      const results = await api.search(query);
      setSearchResults(results);
    } catch (error) {
      console.error('Search failed:', error);
      setSearchResults({ songs: [], albums: [], artists: [] });
    } finally {
      setIsSearching(false);
    }
  }, [api]);

  const clearSearch = useCallback(() => {
    setSearchQuery('');
    setSearchResults({ songs: [], albums: [], artists: [] });
  }, []);

  // Auto-connect on mount if config exists
  useEffect(() => {
    const savedConfig = localStorage.getItem(STORAGE_KEY);
    if (savedConfig) {
      try {
        const config: ServerConfig = JSON.parse(savedConfig);
        connect(config);
      } catch (error) {
        console.error('Failed to parse saved config:', error);
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  }, [connect]);

  // Fetch data when connected
  useEffect(() => {
    if (state.isConnected && api) {
      refreshAll();
    }
  }, [state.isConnected, api, refreshAll]);

  const value = useMemo<ServerContextType>(() => ({
    state,
    api,
    connect,
    disconnect,
    albums,
    artists,
    playlists,
    queueTracks,
    isLoadingAlbums,
    isLoadingArtists,
    isLoadingPlaylists,
    refreshAlbums,
    refreshArtists,
    refreshPlaylists,
    refreshAll,
    setQueueTracks,
    addToQueue,
    updatePlaylistInfo,
    starredTracks,
    starredAlbums,
    isLoadingStarred,
    refreshStarred,
    toggleStar,
    searchQuery,
    searchResults,
    isSearching,
    search,
    clearSearch,
  }), [
    state,
    api,
    connect,
    disconnect,
    albums,
    artists,
    playlists,
    queueTracks,
    isLoadingAlbums,
    isLoadingArtists,
    isLoadingPlaylists,
    refreshAlbums,
    refreshArtists,
    refreshPlaylists,
    refreshAll,
    addToQueue,
    updatePlaylistInfo,
    starredTracks,
    starredAlbums,
    isLoadingStarred,
    refreshStarred,
    toggleStar,
    searchQuery,
    searchResults,
    isSearching,
    search,
    clearSearch,
  ]);

  return (
    <ServerContext.Provider value={value}>
      {children}
    </ServerContext.Provider>
  );
}

export function useServer() {
  const context = useContext(ServerContext);
  if (!context) {
    throw new Error('useServer must be used within a ServerProvider');
  }
  return context;
}
