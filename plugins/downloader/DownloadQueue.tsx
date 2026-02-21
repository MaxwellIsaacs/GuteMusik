import React, { useState, useEffect, useCallback } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';

interface DownloadProgress {
  album_index: number;
  total_albums: number;
  artist: string;
  album: string;
  track_index: number;
  total_tracks: number;
  track_name: string;
  status: string;
  error: string | null;
}

interface ActiveTrack {
  track_index: number;
  track_name: string;
  status: string;
}

interface AlbumState {
  artist: string;
  album: string;
  status: string;
  completed_tracks: number;
  total_tracks: number;
  error: string | null;
  currentTrack?: string;
  currentTrackStatus?: string;
  active_tracks: ActiveTrack[];
}

interface DownloadQueueProps {
  onToast: (msg: string) => void;
  onAllComplete: () => void;
}

export const DownloadQueue: React.FC<DownloadQueueProps> = ({ onToast, onAllComplete }) => {
  const [albums, setAlbums] = useState<AlbumState[]>([]);
  const [isActive, setIsActive] = useState(false);

  // Poll state on mount
  useEffect(() => {
    const poll = async () => {
      try {
        const state = await invoke<{ is_active: boolean; albums: AlbumState[] }>('downloader_get_status');
        setIsActive(state.is_active);
        if (state.albums.length > 0) {
          setAlbums(prev => {
            const updated = [...state.albums];
            // Preserve current track info from events
            for (let i = 0; i < updated.length; i++) {
              if (prev[i]) {
                updated[i].currentTrack = prev[i].currentTrack;
                updated[i].currentTrackStatus = prev[i].currentTrackStatus;
              }
            }
            return updated;
          });
        } else {
          setAlbums([]);
        }
      } catch {}
    };
    poll();
    const interval = setInterval(poll, 2000);
    return () => clearInterval(interval);
  }, []);

  // Listen to progress events
  useEffect(() => {
    const unlisteners: (() => void)[] = [];

    listen<DownloadProgress>('download-progress', (event) => {
      const p = event.payload;
      setAlbums(prev => {
        const next = [...prev];
        if (next[p.album_index]) {
          next[p.album_index] = {
            ...next[p.album_index],
            completed_tracks: p.status === 'done'
              ? next[p.album_index].completed_tracks + 1
              : next[p.album_index].completed_tracks,
            total_tracks: p.total_tracks || next[p.album_index].total_tracks,
            // Keep currentTrack for single-song downloads only
            currentTrack: p.total_tracks === 1 ? p.track_name : next[p.album_index].currentTrack,
            currentTrackStatus: p.total_tracks === 1 ? p.status : next[p.album_index].currentTrackStatus,
          };
        }
        return next;
      });
    }).then(u => unlisteners.push(u));

    listen('download-album-complete', (event: any) => {
      const { artist, album } = event.payload;
      onToast(`Finished: ${artist} - ${album}`);
    }).then(u => unlisteners.push(u));

    listen('download-all-complete', () => {
      setIsActive(false);
      onToast('All downloads complete!');
      onAllComplete();
    }).then(u => unlisteners.push(u));

    listen('download-cancelled', () => {
      setIsActive(false);
      onToast('Downloads cancelled');
    }).then(u => unlisteners.push(u));

    listen('download-error', (event: any) => {
      const { artist, album, error } = event.payload;
      onToast(`Error: ${artist} - ${album}: ${error}`);
    }).then(u => unlisteners.push(u));

    return () => { unlisteners.forEach(u => u()); };
  }, [onToast, onAllComplete]);

  const handleCancel = async () => {
    try {
      await invoke('downloader_cancel');
    } catch (e: any) {
      onToast(`Cancel failed: ${e}`);
    }
  };

  const handleClearFinished = useCallback(async () => {
    try {
      await invoke('downloader_clear_finished');
      // Immediately update local state
      setAlbums(prev => prev.filter(a =>
        a.status !== 'complete' && a.status !== 'error' && a.status !== 'cancelled'
      ));
    } catch (e: any) {
      onToast(`Clear failed: ${e}`);
    }
  }, [onToast]);

  if (albums.length === 0) return null;

  const hasFinished = albums.some(a =>
    a.status === 'complete' || a.status === 'error' || a.status === 'cancelled'
  );

  const activeCount = albums.filter(a =>
    a.status === 'pending' || a.status === 'downloading'
  ).length;

  const statusLabel = (s: string) => {
    switch (s) {
      case 'searching': return 'Searching YouTube...';
      case 'downloading': return 'Downloading...';
      case 'tagging': return 'Tagging...';
      case 'done': return 'Done';
      case 'complete': return 'Complete';
      case 'error': return 'Error';
      case 'cancelled': return 'Cancelled';
      case 'pending': return 'Waiting...';
      case 'fetching_cover': return 'Fetching cover art...';
      case 'fetching_tracklist': return 'Fetching tracklist...';
      default: return s;
    }
  };

  const statusColor = (s: string) => {
    switch (s) {
      case 'complete': return 'text-emerald-400';
      case 'error': return 'text-red-400';
      case 'cancelled': return 'text-orange-400';
      case 'downloading': return 'text-blue-400';
      default: return 'text-white/50';
    }
  };

  const statusDot = (s: string) => {
    switch (s) {
      case 'complete': return 'bg-emerald-400';
      case 'error': return 'bg-red-400';
      case 'cancelled': return 'bg-orange-400';
      case 'downloading': return 'bg-blue-400 animate-pulse';
      case 'pending': return 'bg-white/20';
      default: return 'bg-white/20';
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xs font-bold tracking-[0.2em] text-white/40 uppercase">
          Download Queue
          {activeCount > 0 && (
            <span className="ml-2 text-white/60">{activeCount} active</span>
          )}
        </h3>
        <div className="flex items-center gap-3">
          {hasFinished && (
            <button
              onClick={handleClearFinished}
              className="text-xs text-white/30 hover:text-white/60 transition-colors font-medium tracking-wide"
            >
              Clear Done
            </button>
          )}
          {isActive && (
            <button
              onClick={handleCancel}
              className="text-xs text-red-400/70 hover:text-red-400 transition-colors font-medium tracking-wide"
            >
              Cancel All
            </button>
          )}
        </div>
      </div>

      {albums.map((a, i) => {
        const progress = a.total_tracks > 0 ? (a.completed_tracks / a.total_tracks) * 100 : 0;
        const isFinished = a.status === 'complete' || a.status === 'error' || a.status === 'cancelled';

        return (
          <div
            key={`${a.artist}-${a.album}-${i}`}
            className={`bg-white/[0.03] border border-white/5 rounded-2xl p-5 space-y-3 transition-opacity ${
              isFinished ? 'opacity-50' : ''
            }`}
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-sm font-semibold truncate">{a.album}</div>
                <div className="text-xs text-white/40 truncate">{a.artist}</div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <div className={`w-2 h-2 rounded-full ${statusDot(a.status)}`} />
                <span className={`text-xs font-medium capitalize ${statusColor(a.status)}`}>
                  {statusLabel(a.status)}
                </span>
              </div>
            </div>

            {/* Progress bar */}
            {a.total_tracks > 0 && a.status !== 'complete' && (
              <div className="space-y-2">
                <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-purple-500 to-blue-500 rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[10px] text-white/30 font-mono">
                  <span>
                    {a.completed_tracks}/{a.total_tracks} tracks
                  </span>
                  <span>{Math.round(progress)}%</span>
                </div>
              </div>
            )}

            {/* Active tracks (concurrent downloads) */}
            {a.active_tracks?.length > 0 && a.status === 'downloading' && (
              <div className="space-y-1">
                {a.active_tracks.map((at) => (
                  <div key={at.track_index} className="text-[11px] text-white/30 truncate">
                    <span className="text-white/50">{statusLabel(at.status)}</span>
                    {' '}
                    {at.track_name}
                  </div>
                ))}
              </div>
            )}
            {/* Fallback for single-song downloads */}
            {(!a.active_tracks || a.active_tracks.length === 0) && a.currentTrack && a.status === 'downloading' && (
              <div className="text-[11px] text-white/30 truncate">
                <span className="text-white/50">{statusLabel(a.currentTrackStatus || '')}</span>
                {' '}
                {a.currentTrack}
              </div>
            )}

            {/* Error */}
            {a.error && (
              <div className="text-[11px] text-red-400/70 truncate">
                {a.error}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
