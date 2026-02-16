import React from 'react';
import { Plus, Radio } from '@phosphor-icons/react';
import { ChromeIcon } from '../ChromeIcon';
import { ContextMenuState } from '../../types';

interface ContextMenuProps {
  menu: ContextMenuState | null;
  onClose: () => void;
  onAction: (action: string, item: any) => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({ menu, onClose, onAction }) => {
  if (!menu) return null;

  const handleAction = (label: string) => {
    onAction(label, menu.item);
    onClose();
  };

  return (
    <div 
      className="fixed z-[100] w-64 bg-[#0a0a0a] border border-white/10 rounded-xl shadow-2xl overflow-hidden p-1"
      style={{ top: menu.y, left: menu.x }}
      onMouseLeave={onClose}
    >
      <div className="px-3 py-2 border-b border-white/5 mb-1">
        <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest truncate">{menu.type}</p>
        <p className="text-sm font-bold text-white truncate">{menu.item.title || menu.item.id}</p>
      </div>
      {[
        { icon: <ChromeIcon name="play" size={16} />, label: "Play Now" },
        { icon: <Plus size={16} weight="light" />, label: "Add to Queue" },
        { icon: <ChromeIcon name="heart" size={16} />, label: "Love Track" },
        { icon: <ChromeIcon name="fast-forward" size={16} />, label: "Download" },
        { icon: <Radio size={16} weight="light" />, label: "Start Radio" },
        { icon: <ChromeIcon name="share" size={16} />, label: "Share Link" },
      ].map((opt, i) => (
        <button 
          key={i} 
          onClick={() => handleAction(opt.label)}
          className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-white/80 hover:bg-white hover:text-black transition-colors"
        >
          {opt.icon} {opt.label}
        </button>
      ))}
    </div>
  );
};