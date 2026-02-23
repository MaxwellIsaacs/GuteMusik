import React, { useState, useEffect, useCallback } from 'react';
import { PluginIpcAPI } from '../../types';

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
  ipc: PluginIpcAPI;
}

export const DownloadQueue: React.FC<DownloadQueueProps> = ({ onToast, onAllComplete, ipc }) => {
  const { invoke, listen } = ipc;
  const [albums, setAlbums] = useState<AlbumState[]>([]);
  const [isActive, setIsActive] = useState(false);
  const [expandedAlbums, setExpandedAlbums] = useState<Set<number>>(new Set());

  // Poll state on mount
  useEffect(() => {
    const poll = async () => {
      try {
        const state = await invoke<{ is_active: boolean; albums: AlbumState[] }>('downloader_get_status');
        setIsActive(state.is_active);
        if (state.albums.length > 0) {
          setAlbums(prev => {
            const updated = [...state.albums];
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

    listen<DownloadProgress>('download-progress', (p) => {
      setAlbums(prev => {
        const next = [...prev];
        if (next[p.album_index]) {
          next[p.album_index] = {
            ...next[p.album_index],
            completed_tracks: p.status === 'done'
              ? next[p.album_index].completed_tracks + 1
              : next[p.album_index].completed_tracks,
            total_tracks: p.total_tracks || next[p.album_index].total_tracks,
            currentTrack: p.total_tracks === 1 ? p.track_name : next[p.album_index].currentTrack,
            currentTrackStatus: p.total_tracks === 1 ? p.status : next[p.album_index].currentTrackStatus,
          };
        }
        return next;
      });
    }).then(u => unlisteners.push(u));

    listen<{ artist: string; album: string }>('download-album-complete', (payload) => {
      onToast(`Finished: ${payload.artist} - ${payload.album}`);
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

    listen<{ artist: string; album: string; error: string }>('download-error', (payload) => {
      onToast(`Error: ${payload.artist} - ${payload.album}: ${payload.error}`);
    }).then(u => unlisteners.push(u));

    return () => { unlisteners.forEach(u => u()); };
  }, [onToast, onAllComplete, listen]);

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
      setAlbums(prev => prev.filter(a =>
        a.status !== 'complete' && a.status !== 'error' && a.status !== 'cancelled'
      ));
      setExpandedAlbums(new Set());
    } catch (e: any) {
      onToast(`Clear failed: ${e}`);
    }
  }, [onToast]);

  const handleRetry = useCallback(async (artist: string, album: string) => {
    try {
      await invoke('downloader_retry_album', { artist, album, genre: '' });
      onToast(`Retrying: ${artist} - ${album}`);
    } catch (e: any) {
      onToast(`Retry failed: ${e}`);
    }
  }, [onToast]);

  const toggleExpand = (index: number) => {
    setExpandedAlbums(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  if (albums.length === 0) {
    return (
      <div className="space-y-3">
        <h3 className="text-xs font-bold tracking-[0.2em] text-white/40 uppercase mb-4">
          Download Queue
        </h3>
        <div className="text-center py-12 text-white/15 text-sm">
          <div className="text-2xl mb-3 opacity-50">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div>No downloads queued</div>
          <div className="text-xs text-white/10 mt-1">Select albums or songs to get started</div>
        </div>
      </div>
    );
  }

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

  const trackStatusIcon = (s: string) => {
    switch (s) {
      case 'done': return <span className="text-emerald-400 text-[10px]">&#10003;</span>;
      case 'error': return <span className="text-red-400 text-[10px]">&#10007;</span>;
      case 'downloading': return <span className="w-2.5 h-2.5 border border-blue-400/50 border-t-blue-400 rounded-full animate-spin inline-block" />;
      case 'searching': return <span className="w-2.5 h-2.5 border border-white/20 border-t-white/50 rounded-full animate-spin inline-block" />;
      case 'tagging': return <span className="text-purple-400 text-[10px]">&#9998;</span>;
      default: return <span className="w-2 h-2 rounded-full bg-white/10 inline-block" />;
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
        const isFailed = a.status === 'error' || a.status === 'cancelled';
        const isExpanded = expandedAlbums.has(i);
        const hasTrackDetails = a.active_tracks?.length > 0 || a.total_tracks > 1;

        return (
          <div
            key={`${a.artist}-${a.album}-${i}`}
            className={`bg-white/[0.03] border border-white/5 rounded-2xl overflow-hidden transition-opacity ${
              isFinished ? 'opacity-50' : ''
            }`}
          >
            {/* Header - clickable to expand */}
            <button
              onClick={() => hasTrackDetails && toggleExpand(i)}
              className={`w-full p-5 text-left ${hasTrackDetails ? 'cursor-pointer hover:bg-white/[0.02]' : 'cursor-default'} transition-colors`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold truncate">{a.album}</div>
                  <div className="text-xs text-white/40 truncate">{a.artist}</div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <div className={`w-2 h-2 rounded-full ${statusDot(a.status)}`} />
                  <span className={`text-xs font-medium capitalize ${statusColor(a.status)}`}>
                    {statusLabel(a.status)}
                  </span>
                  {hasTrackDetails && (
                    <svg
                      width="12" height="12" viewBox="0 0 12 12" fill="none"
                      className={`text-white/20 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                    >
                      <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </div>
              </div>

              {/* Progress bar */}
              {a.total_tracks > 0 && a.status !== 'complete' && (
                <div className="mt-3 space-y-2">
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

              {/* Compact active tracks (when NOT expanded) */}
              {!isExpanded && a.active_tracks?.length > 0 && a.status === 'downloading' && (
                <div className="mt-2 space-y-1">
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
                <div className="mt-2 text-[11px] text-white/30 truncate">
                  <span className="text-white/50">{statusLabel(a.currentTrackStatus || '')}</span>
                  {' '}
                  {a.currentTrack}
                </div>
              )}

              {/* Error message */}
              {a.error && !isExpanded && (
                <div className="mt-2 text-[11px] text-red-400/70 truncate">
                  {a.error}
                </div>
              )}
            </button>

            {/* Expanded track list */}
            {isExpanded && (
              <div className="border-t border-white/5 px-5 py-3 space-y-1.5 max-h-48 overflow-y-auto">
                {a.active_tracks?.length > 0 ? (
                  a.active_tracks.map((at) => (
                    <div key={at.track_index} className="flex items-center gap-2 text-[11px]">
                      <span className="w-4 flex-shrink-0 text-center">{trackStatusIcon(at.status)}</span>
                      <span className="text-white/20 font-mono w-5 text-right flex-shrink-0">{at.track_index + 1}</span>
                      <span className="text-white/40 truncate">{at.track_name}</span>
                      <span className="text-white/20 ml-auto flex-shrink-0">{at.status}</span>
                    </div>
                  ))
                ) : a.total_tracks > 0 && a.status === 'complete' ? (
                  <div className="text-[11px] text-white/20 text-center py-2">
                    All {a.total_tracks} tracks completed
                  </div>
                ) : null}

                {a.error && (
                  <div className="text-[11px] text-red-400/70 pt-1 border-t border-white/5 mt-2">
                    {a.error}
                  </div>
                )}
              </div>
            )}

            {/* Retry button for failed items */}
            {isFailed && (
              <div className="border-t border-white/5 px-5 py-3">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRetry(a.artist, a.album);
                  }}
                  className="w-full text-xs font-medium text-white/40 hover:text-white py-1.5 rounded-lg hover:bg-white/5 transition-colors"
                >
                  Retry Download
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
