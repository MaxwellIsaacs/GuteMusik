import React, { useState, useRef, useEffect } from 'react';
import { Plus, CaretRight, MusicNotesPlus } from '@phosphor-icons/react';
import { ChromeIcon } from '../ChromeIcon';
import { ContextMenuState, Playlist } from '../../types';

interface ContextMenuProps {
  menu: ContextMenuState | null;
  playlists: Playlist[];
  onClose: () => void;
  onAction: (action: string, item: any, extra?: any) => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({ menu, playlists, onClose, onAction }) => {
  const [showPlaylistSub, setShowPlaylistSub] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setShowPlaylistSub(false);
  }, [menu]);

  if (!menu) return null;

  const handleAction = (label: string, extra?: any) => {
    onAction(label, menu.item, extra);
    onClose();
    setShowPlaylistSub(false);
  };

  const isTrack = !!menu.item.duration;

  const startCloseTimer = () => {
    closeTimerRef.current = window.setTimeout(() => {
      onClose();
      setShowPlaylistSub(false);
    }, 200);
  };

  const cancelCloseTimer = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  const menuWidth = 256;
  const menuHeight = 300;
  const subMenuWidth = 224;
  const pad = 8;
  const vh = window.innerHeight;
  const vw = window.innerWidth;

  const x = Math.min(menu.x, vw - menuWidth - pad);
  const flipUp = menu.y + menuHeight > vh - pad;
  const y = flipUp ? Math.max(pad, menu.y - menuHeight) : menu.y;

  const subFlipLeft = x + menuWidth + subMenuWidth > vw - pad;

  return (
    <div
      ref={containerRef}
      className="fixed z-[100]"
      style={{ top: 0, left: 0 }}
      onMouseLeave={startCloseTimer}
      onMouseEnter={cancelCloseTimer}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className="absolute w-64 bg-[#0a0a0a] border border-white/10 rounded-xl shadow-2xl overflow-visible p-1"
        style={{ top: y, left: x }}
      >
        <div className="px-3 py-2 border-b border-white/5 mb-1">
          <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest truncate">{menu.type}</p>
          <p className="text-sm font-bold text-white truncate">{menu.item.title || menu.item.id}</p>
        </div>
        {[
          { icon: <ChromeIcon name="play" size={16} />, label: "Play Now" },
          { icon: <Plus size={16} weight="light" />, label: "Add to Queue" },
          { icon: <ChromeIcon name="heart" size={16} />, label: "Love Track" },
        ].map((opt, i) => (
          <button
            key={i}
            onClick={() => handleAction(opt.label)}
            onMouseEnter={() => setShowPlaylistSub(false)}
            className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-white/80 hover:bg-white hover:text-black transition-colors"
          >
            {opt.icon} {opt.label}
          </button>
        ))}

        {isTrack && (
          <div className="relative">
            <button
              onMouseEnter={() => setShowPlaylistSub(true)}
              onClick={() => setShowPlaylistSub(!showPlaylistSub)}
              className={`w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                showPlaylistSub ? 'bg-white/10 text-white' : 'text-white/80 hover:bg-white hover:text-black'
              }`}
            >
              <MusicNotesPlus size={16} weight="light" /> Add to Playlist <CaretRight size={12} className="ml-auto opacity-50" />
            </button>

            {showPlaylistSub && (
              <div
                className={`absolute top-0 w-56 bg-[#0a0a0a] border border-white/10 rounded-xl shadow-2xl overflow-hidden p-1 max-h-72 overflow-y-auto no-scrollbar ${
                  subFlipLeft ? 'right-full mr-1' : 'left-full ml-1'
                }`}
              >
                <div className="px-3 py-1.5 border-b border-white/5 mb-1">
                  <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Choose Playlist</p>
                </div>
                {playlists.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-white/30">No playlists yet</p>
                ) : (
                  playlists.map((pl) => (
                    <button
                      key={pl.id}
                      onClick={() => handleAction('Add to Playlist', { playlistId: pl.id, playlistName: pl.title })}
                      className="w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-white/80 hover:bg-white hover:text-black transition-colors"
                    >
                      <span className="truncate">{pl.title}</span>
                      <span className="ml-auto text-[10px] opacity-40 flex-shrink-0">{pl.count}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        )}

        <button
          onClick={() => handleAction("Download")}
          onMouseEnter={() => setShowPlaylistSub(false)}
          className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-white/80 hover:bg-white hover:text-black transition-colors"
        >
          <ChromeIcon name="download" size={16} /> Download
        </button>
      </div>
    </div>
  );
};
