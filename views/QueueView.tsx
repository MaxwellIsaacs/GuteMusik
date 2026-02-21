import React, { useState } from 'react';
import { Trash, ListDashes, DotsSixVertical, FloppyDisk, X, CloudSlash } from '@phosphor-icons/react';
import { ChromeIcon } from '../components/ChromeIcon';
import { useServer } from '../context/ServerContext';
import { useAudio } from '../context/AudioContext';
import { formatTime } from '../utils/formatTime';
import { ArtistLink } from '../components/ArtistLink';
import { PLACEHOLDER_COVER } from '../utils/placeholders';

interface QueueViewProps {
    onToast: (msg: string) => void;
    onContextMenu: (e: React.MouseEvent, item: any, type: string) => void;
    onNavigateToArtist: (id: string) => void;
}

export const QueueView: React.FC<QueueViewProps> = ({ onToast, onContextMenu, onNavigateToArtist }) => {
    const { state: serverState, queueTracks, setQueueTracks } = useServer();
    const { state: audioState, playTrack, togglePlay } = useAudio();
    const { currentTrack, isPlaying, currentTime, duration } = audioState;

    // Drag state
    const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
    const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

    const clearQueue = () => {
        setQueueTracks([]);
        onToast("Queue cleared");
    };

    const removeFromQueue = (trackId: string) => {
        setQueueTracks(queueTracks.filter(t => t.id !== trackId));
        onToast("Removed from queue");
    };

    const moveTrack = (fromIndex: number, toIndex: number) => {
        if (fromIndex === toIndex) return;
        const newQueue = [...queueTracks];
        const [removed] = newQueue.splice(fromIndex, 1);
        newQueue.splice(toIndex, 0, removed);
        setQueueTracks(newQueue);
    };

    const handleDragStart = (e: React.DragEvent, index: number) => {
        setDraggedIndex(index);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', index.toString());
    };

    const handleDragOver = (e: React.DragEvent, index: number) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (draggedIndex !== index) {
            setDragOverIndex(index);
        }
    };

    const handleDrop = (e: React.DragEvent, toIndex: number) => {
        e.preventDefault();
        const fromIndex = parseInt(e.dataTransfer.getData('text/plain'), 10);
        if (!isNaN(fromIndex) && fromIndex !== toIndex) {
            moveTrack(fromIndex, toIndex);
        }
        setDraggedIndex(null);
        setDragOverIndex(null);
    };

    const handleDragEnd = () => {
        setDraggedIndex(null);
        setDragOverIndex(null);
    };

    const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

    if (!serverState.isConnected) {
        return (
            <div className="animate-fade-in pb-40 flex flex-col items-center justify-center min-h-[60vh]">
                <CloudSlash size={64} weight="light" className="text-white/20 mb-6" />
                <h2 className="text-2xl font-bold text-white/60 mb-2">Not Connected</h2>
                <p className="text-white/40 text-sm">Go to Settings to connect to your Navidrome server.</p>
            </div>
        );
    }

    return (
        <div className="animate-fade-in pb-40">
            {/* Header — preserved */}
            <header className="flex items-end justify-between mb-8 sticky top-0 z-20 py-4 mix-blend-difference select-none">
                <div>
                    <h1 className="text-7xl font-medium tracking-tighter text-white mb-2">Queue</h1>
                    <p className="text-white/50 text-sm tracking-wide font-mono flex items-center gap-3">
                        <span className="flex items-center gap-1.5"><ListDashes size={14} weight="light"/> UP NEXT</span>
                        <span className="w-1 h-1 rounded-full bg-white/30"></span>
                        <span>{queueTracks.length + (currentTrack ? 1 : 0)} TRACKS</span>
                    </p>
                </div>
                <div className="flex gap-2 items-center">
                    <button
                        className="px-6 py-2 rounded-full border text-xs font-bold uppercase transition-colors flex items-center gap-2 border-white/20 bg-white text-black"
                    >
                        <ListDashes size={14} weight="fill" />
                        Queue
                    </button>
                    <button
                         onClick={() => onToast("Saved as Playlist")}
                         className="px-6 py-2 rounded-full border border-white/10 bg-transparent text-white/50 hover:text-white hover:border-white/40 transition-colors flex items-center gap-2 text-xs font-bold uppercase"
                         title="Save as Playlist"
                    >
                        <FloppyDisk size={14} weight="light"/>
                        Save as Playlist
                    </button>
                </div>
            </header>

            {/* Two-column layout: now playing left, queue list right */}
            <div className="flex flex-col lg:flex-row gap-10">

                {/* Left column — Now Playing, sticky */}
                <div className="lg:w-[340px] flex-shrink-0">
                    <div className="sticky top-20">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-xs font-bold uppercase tracking-widest text-white/40">Now Playing</h2>
                        </div>

                        {currentTrack ? (
                            <div className="flex flex-col">
                                {/* Album art — large, square */}
                                <div
                                    className="relative aspect-square w-full rounded-lg overflow-hidden cursor-pointer group mb-6"
                                    onClick={togglePlay}
                                >
                                    <img
                                        src={currentTrack.cover || PLACEHOLDER_COVER}
                                        className="w-full h-full object-cover"
                                        alt={currentTrack.title}
                                    />
                                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                                        <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                                            {isPlaying
                                                ? <ChromeIcon name="pause" size={48} />
                                                : <ChromeIcon name="play" size={48} className="ml-1" />
                                            }
                                        </div>
                                    </div>
                                    {isPlaying && (
                                        <div className="absolute bottom-3 right-3 flex gap-[3px] items-end h-4">
                                            <div className="w-[3px] bg-white rounded-full animate-[bounce_0.9s_infinite]" style={{ height: '55%' }}></div>
                                            <div className="w-[3px] bg-white rounded-full animate-[bounce_1.1s_infinite]" style={{ height: '100%' }}></div>
                                            <div className="w-[3px] bg-white rounded-full animate-[bounce_0.75s_infinite]" style={{ height: '40%' }}></div>
                                        </div>
                                    )}
                                </div>

                                {/* Track details */}
                                <h3 className="text-2xl font-bold text-white tracking-tight mb-1 truncate">
                                    {currentTrack.title}
                                </h3>
                                <p className="text-white/60 text-sm mb-1 truncate">
                                    <ArtistLink artistName={currentTrack.artist} artistId={currentTrack.artistId} onNavigate={onNavigateToArtist} />
                                </p>
                                {currentTrack.album && (
                                    <p className="text-white/30 text-xs truncate mb-4">{currentTrack.album}</p>
                                )}

                                {/* Progress */}
                                <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden mb-2">
                                    <div className="h-full bg-white/70 rounded-full" style={{ width: `${progress}%` }} />
                                </div>
                                <div className="flex justify-between text-[10px] font-mono text-white/30 mb-6">
                                    <span>{formatTime(currentTime)}</span>
                                    <span>{formatTime(duration)}</span>
                                </div>

                                {/* Meta row */}
                                <div className="flex items-center gap-3">
                                    <span className="px-2 py-0.5 rounded bg-white/[0.07] text-[9px] font-mono text-white/40 border border-white/[0.06]">
                                        {currentTrack.format}
                                    </span>
                                    {currentTrack.bitrate && (
                                        <span className="text-[9px] font-mono text-white/25">{currentTrack.bitrate}</span>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="aspect-square w-full rounded-lg bg-white/[0.03] border border-white/[0.06] flex items-center justify-center">
                                <p className="text-white/20 text-sm">No track playing</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Right column — Queue list, full height */}
                <div className="flex-1 min-w-0">
                    {/* List header */}
                    <div className="flex items-center justify-between mb-3 border-b border-white/[0.06] pb-3">
                        <h2 className="text-xs font-bold uppercase tracking-widest text-white/40">Up Next</h2>
                        <div className="flex items-center gap-2">
                            <button onClick={() => onToast("Shuffle Toggled")} className="p-1.5 rounded text-white/30 hover:text-white transition-colors" title="Shuffle">
                                <ChromeIcon name="shuffle" size={15} />
                            </button>
                            <button onClick={() => onToast("Repeat Toggled")} className="p-1.5 rounded text-white/30 hover:text-white transition-colors" title="Repeat">
                                <ChromeIcon name="repeat" size={15} />
                            </button>
                            <div className="w-px h-4 bg-white/10 mx-1" />
                            <button
                                onClick={clearQueue}
                                className="text-white/30 hover:text-rose-500 transition-colors flex items-center gap-1.5 text-xs"
                                title="Clear Queue"
                            >
                                <Trash size={13} weight="light"/>
                                <span className="uppercase tracking-wider font-medium text-[10px]">Clear</span>
                            </button>
                        </div>
                    </div>

                    {queueTracks.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-white/20">
                            <ListDashes size={40} weight="light" className="mb-4" />
                            <p className="text-sm">Queue is empty</p>
                            <p className="text-xs mt-1 text-white/15">Add tracks from your library</p>
                        </div>
                    ) : (
                        <div className="flex flex-col">
                            {queueTracks.map((track, index) => (
                                <div
                                    key={track.id}
                                    draggable
                                    onDragStart={(e) => handleDragStart(e, index)}
                                    onDragOver={(e) => handleDragOver(e, index)}
                                    onDrop={(e) => handleDrop(e, index)}
                                    onDragEnd={handleDragEnd}
                                    onContextMenu={(e) => onContextMenu(e, track, "Queue Item")}
                                    onClick={() => playTrack(track)}
                                    className={`group flex items-center gap-3 py-2.5 px-2 rounded-lg hover:bg-white/[0.04] transition-colors cursor-pointer
                                        ${draggedIndex === index ? 'opacity-40' : ''}
                                        ${dragOverIndex === index && draggedIndex !== index ? 'border-t-2 border-purple-500' : ''}
                                    `}
                                >
                                    {/* Drag handle */}
                                    <div className="w-6 flex items-center justify-center text-white/15 group-hover:text-white/40 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity">
                                        <DotsSixVertical size={18} />
                                    </div>

                                    {/* Index */}
                                    <span className="w-5 text-center text-[11px] font-mono text-white/20">
                                        {(index + 1).toString().padStart(2, '0')}
                                    </span>

                                    {/* Art */}
                                    <div className="w-10 h-10 rounded overflow-hidden bg-neutral-800 flex-shrink-0">
                                        <img
                                            src={track.cover || PLACEHOLDER_COVER}
                                            className="w-full h-full object-cover"
                                            alt={track.title}
                                            onError={(e) => {
                                                (e.target as HTMLImageElement).src = PLACEHOLDER_COVER;
                                            }}
                                        />
                                    </div>

                                    {/* Info */}
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm text-white truncate">{track.title}</p>
                                        <p className="text-xs text-white/35 truncate">
                                            <ArtistLink artistName={track.artist} artistId={track.artistId} onNavigate={onNavigateToArtist} />
                                        </p>
                                    </div>

                                    {/* Album */}
                                    <div className="hidden md:block w-1/4 text-xs text-white/25 truncate">
                                        {track.album}
                                    </div>

                                    {/* Duration */}
                                    <span className="text-[11px] font-mono text-white/25 tabular-nums w-12 text-right">
                                        {track.duration}
                                    </span>

                                    {/* Remove */}
                                    <button
                                        onClick={(e) => { e.stopPropagation(); removeFromQueue(track.id); }}
                                        className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-white/10 text-white/15 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100"
                                        title="Remove"
                                    >
                                        <X size={13} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                </div>
            </div>
        </div>
    );
};
