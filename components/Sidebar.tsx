import React from 'react';
import { Plus } from '@phosphor-icons/react';
import { ChromeIcon, ChromeIconName } from './ChromeIcon';
import { ViewState, PluginDefinition } from '../types';
import { useServer } from '../context/ServerContext';

interface SidebarProps {
  activeTab: ViewState;
  onNavigate: (view: ViewState) => void;
  onNewPlaylist: () => void;
  plugins?: PluginDefinition[];
  collapsed: boolean;
  onToggleCollapse: () => void;
}

// ── Extracted so React sees a stable component identity across renders ──

const NavItem: React.FC<{
  label: string; iconName: ChromeIconName; active: boolean; collapsed: boolean; onClick: () => void;
}> = ({ label, iconName, active, collapsed, onClick }) => (
  <button
    onClick={(e) => { e.stopPropagation(); onClick(); }}
    title={collapsed ? label : undefined}
    className={`w-full rounded-xl flex items-center group
      ${collapsed ? 'py-3 justify-center' : 'px-4 py-3 gap-4'}
      ${active ? 'bg-white/10 text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)]' : 'text-white/50 hover:text-white hover:bg-white/5'}
    `}
  >
    <ChromeIcon name={iconName} size={18} className={`flex-shrink-0 ${active ? 'opacity-100' : 'opacity-60 group-hover:opacity-100'}`} />
    {!collapsed && (
      <span className={`text-sm font-medium tracking-wide whitespace-nowrap ${active ? 'opacity-100' : 'opacity-80'}`}>
        {label}
      </span>
    )}
  </button>
);

const PluginNavItem: React.FC<{
  plugin: PluginDefinition; active: boolean; collapsed: boolean; onNavigate: (view: ViewState) => void;
}> = ({ plugin, active, collapsed, onNavigate }) => {
  const IconComponent = typeof plugin.icon === 'string' ? null : plugin.icon;
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onNavigate(`Plugin:${plugin.id}`); }}
      title={collapsed ? plugin.label : undefined}
      className={`w-full rounded-xl flex items-center group
        ${collapsed ? 'py-3 justify-center' : 'px-4 py-3 gap-4'}
        ${active ? 'bg-white/10 text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)]' : 'text-white/50 hover:text-white hover:bg-white/5'}
      `}
    >
      {typeof plugin.icon === 'string' ? (
        <ChromeIcon name={plugin.icon} size={18} className={`flex-shrink-0 ${active ? 'opacity-100' : 'opacity-60 group-hover:opacity-100'}`} />
      ) : (
        IconComponent && <IconComponent size={18} className={`flex-shrink-0 ${active ? 'opacity-100' : 'opacity-60 group-hover:opacity-100'}`} />
      )}
      {!collapsed && (
        <span className={`text-sm font-medium tracking-wide whitespace-nowrap ${active ? 'opacity-100' : 'opacity-80'}`}>
          {plugin.label}
        </span>
      )}
    </button>
  );
};

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, onNavigate, onNewPlaylist, plugins = [], collapsed, onToggleCollapse }) => {
  const { state } = useServer();

  const getServerDisplayName = () => {
    if (!state.serverUrl) return 'Disconnected';
    try { return new URL(state.serverUrl).host; } catch { return state.serverUrl; }
  };

  return (
    <aside
      className="flex flex-col pt-2 pb-6 z-50 h-full overflow-hidden"
      style={{ width: collapsed ? 68 : 256, transition: 'width 150ms ease' }}
      onDoubleClick={onToggleCollapse}
    >
      {/* Spacer for native traffic lights (macOS overlay titlebar) */}
      <div data-tauri-drag-region className="h-10 mb-4 select-none" />

      <nav className={`flex flex-col gap-2 flex-1 ${collapsed ? 'px-3' : 'pl-4'}`}>
        <NavItem label="Library" iconName="music-note" active={activeTab === 'Library'} collapsed={collapsed} onClick={() => onNavigate('Library')} />
        <NavItem label="Playlists" iconName="album" active={activeTab === 'Playlists'} collapsed={collapsed} onClick={() => onNavigate('Playlists')} />
        <NavItem label="Artist" iconName="microphone" active={activeTab === 'Artist'} collapsed={collapsed} onClick={() => onNavigate('Artist')} />
        <NavItem label="Queue" iconName="playlist" active={activeTab === 'Queue'} collapsed={collapsed} onClick={() => onNavigate('Queue')} />

        <div className={`my-6 h-[1px] bg-white/10 ${collapsed ? 'w-8 mx-auto' : 'w-12 ml-4'}`} />

        <div className={collapsed ? 'flex justify-center' : 'px-4'}>
          <button
            onClick={(e) => { e.stopPropagation(); onNewPlaylist(); }}
            title={collapsed ? 'New Playlist' : undefined}
            className={collapsed
              ? 'w-10 h-10 rounded-xl text-white/40 hover:text-white hover:bg-white/10 flex items-center justify-center'
              : `w-full py-3 bg-white/5 border border-white/5 rounded-xl text-white/60 text-xs font-bold uppercase tracking-widest hover:bg-white hover:text-black transition-colors flex items-center justify-center gap-2`
            }
          >
            <Plus size={14} weight="bold" className="flex-shrink-0" />
            {!collapsed && <span>New Playlist</span>}
          </button>
        </div>

        {plugins.length > 0 && (
          <>
            <div className={`my-6 h-[1px] bg-white/10 ${collapsed ? 'w-8 mx-auto' : 'w-12 ml-4'}`} />
            {plugins.map((plugin) => (
              <PluginNavItem key={plugin.id} plugin={plugin} active={activeTab === `Plugin:${plugin.id}`} collapsed={collapsed} onNavigate={onNavigate} />
            ))}
          </>
        )}
      </nav>

      {/* Server Status */}
      <div className="px-2">
        <button
          onClick={(e) => { e.stopPropagation(); onNavigate('Settings'); }}
          title={collapsed ? `Navidrome – ${getServerDisplayName()}` : undefined}
          className={`w-full flex items-center p-3 rounded-xl transition-colors border border-transparent group
            ${collapsed ? 'justify-center' : 'gap-3'}
            ${activeTab === 'Settings' ? 'bg-white/10' : 'hover:bg-white/5 hover:border-white/5'}
          `}
        >
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold relative flex-shrink-0 ${state.isConnected ? 'bg-purple-500 text-black' : 'bg-red-500 text-white'}`}>
            ND
            <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-black ${state.isConnected ? 'bg-purple-400' : 'bg-red-400'}`} />
          </div>
          {!collapsed && (
            <>
              <div className="text-left overflow-hidden">
                <div className="text-xs font-bold text-white truncate">Navidrome</div>
                <div className={`text-[10px] font-mono truncate ${state.isConnected ? 'text-white/40 group-hover:text-purple-400' : 'text-red-400'}`}>
                  {getServerDisplayName()}
                </div>
              </div>
              <div className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
                <ChromeIcon name="settings" size={16} className="opacity-40" />
              </div>
            </>
          )}
        </button>
      </div>
    </aside>
  );
};
