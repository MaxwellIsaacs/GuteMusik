import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { PluginViewProps } from '../../types';
import '@xterm/xterm/css/xterm.css';

const STORAGE_KEY = 'lumina-terminal-cwd';

export const TerminalView: React.FC<PluginViewProps> = ({ onToast }) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [terminalId] = useState(() => `terminal-${Date.now()}`);
  const [isConnected, setIsConnected] = useState(false);
  const [cwd, setCwd] = useState(() => localStorage.getItem(STORAGE_KEY) || '');
  const [showConfig, setShowConfig] = useState(() => !localStorage.getItem(STORAGE_KEY));

  const spawnTerminal = useCallback(async (directory: string) => {
    if (!xtermRef.current || !fitAddonRef.current) return;

    const term = xtermRef.current;
    const fitAddon = fitAddonRef.current;

    try {
      fitAddon.fit();
      const cols = term.cols;
      const rows = term.rows;

      await invoke('terminal_spawn', {
        id: terminalId,
        cwd: directory || undefined,
        cols,
        rows,
      });

      setIsConnected(true);

      // Send initial command to launch claude
      setTimeout(() => {
        invoke('terminal_write', { id: terminalId, data: 'claude\n' });
      }, 500);

    } catch (error) {
      console.error('Failed to spawn terminal:', error);
      onToast(`Failed to start terminal: ${error}`);
    }
  }, [terminalId, onToast]);

  useEffect(() => {
    if (!terminalRef.current || showConfig) return;

    // Initialize xterm.js
    const term = new Terminal({
      cursorBlink: true,
      fontFamily: '"JetBrains Mono", "Fira Code", "SF Mono", Menlo, Monaco, "Courier New", monospace',
      fontSize: 13,
      lineHeight: 1.3,
      theme: {
        background: '#0a0a0a',
        foreground: '#e4e4e7',
        cursor: '#a78bfa',
        cursorAccent: '#0a0a0a',
        selectionBackground: '#a78bfa40',
        black: '#18181b',
        red: '#f87171',
        green: '#4ade80',
        yellow: '#facc15',
        blue: '#60a5fa',
        magenta: '#c084fc',
        cyan: '#22d3ee',
        white: '#e4e4e7',
        brightBlack: '#52525b',
        brightRed: '#fca5a5',
        brightGreen: '#86efac',
        brightYellow: '#fde047',
        brightBlue: '#93c5fd',
        brightMagenta: '#d8b4fe',
        brightCyan: '#67e8f9',
        brightWhite: '#fafafa',
      },
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    term.open(terminalRef.current);
    fitAddon.fit();

    // Handle user input
    term.onData((data) => {
      if (isConnected) {
        invoke('terminal_write', { id: terminalId, data });
      }
    });

    // Handle resize
    const handleResize = () => {
      fitAddon.fit();
      if (isConnected) {
        invoke('terminal_resize', {
          id: terminalId,
          cols: term.cols,
          rows: term.rows,
        });
      }
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(terminalRef.current);

    // Listen for terminal output
    let unlistenOutput: UnlistenFn | null = null;
    let unlistenExit: UnlistenFn | null = null;

    (async () => {
      unlistenOutput = await listen<string>(`terminal-output-${terminalId}`, (event) => {
        term.write(event.payload);
      });

      unlistenExit = await listen(`terminal-exit-${terminalId}`, () => {
        term.write('\r\n\x1b[90m[Terminal session ended]\x1b[0m\r\n');
        setIsConnected(false);
      });
    })();

    // Spawn the terminal
    spawnTerminal(cwd);

    // Cleanup
    return () => {
      if (unlistenOutput) unlistenOutput();
      if (unlistenExit) unlistenExit();
      resizeObserver.disconnect();
      invoke('terminal_kill', { id: terminalId });
      term.dispose();
    };
  }, [terminalId, showConfig, cwd, spawnTerminal, isConnected]);

  const handleSaveConfig = () => {
    localStorage.setItem(STORAGE_KEY, cwd);
    setShowConfig(false);
  };

  const handleRestart = async () => {
    if (xtermRef.current) {
      xtermRef.current.clear();
      await invoke('terminal_kill', { id: terminalId });
      setIsConnected(false);
      setTimeout(() => {
        spawnTerminal(cwd);
      }, 100);
    }
  };

  if (showConfig) {
    return (
      <div className="pb-32">
        <div className="mb-8">
          <h2 className="text-[10px] font-bold tracking-[0.2em] text-white/30 uppercase mb-2">Plugin</h2>
          <h1 className="text-4xl font-bold tracking-tight">Claude Terminal</h1>
        </div>

        <div className="max-w-xl space-y-6">
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6">
            <h3 className="text-sm font-semibold mb-4">Music Library Path</h3>
            <p className="text-sm text-white/50 mb-4">
              Set the path to your music library. The terminal will open in this directory,
              making it easy to use Claude Code for library management tasks.
            </p>
            <input
              type="text"
              value={cwd}
              onChange={(e) => setCwd(e.target.value)}
              placeholder="/path/to/your/music/library"
              className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:border-violet-500/50 placeholder:text-white/20"
            />
            <p className="text-xs text-white/30 mt-2">
              Example: /home/user/Music or ~/Music
            </p>
          </div>

          <div className="bg-violet-500/10 border border-violet-500/20 rounded-2xl p-6">
            <h3 className="text-sm font-semibold mb-2 text-violet-300">About This Plugin</h3>
            <p className="text-sm text-white/60 leading-relaxed">
              This terminal plugin is designed for Claude Code integration. When you open it,
              it automatically launches Claude Code in your music library directory, allowing
              you to manage files, organize albums, fix metadata, and more using natural language.
            </p>
          </div>

          <button
            onClick={handleSaveConfig}
            className="w-full bg-violet-600 hover:bg-violet-500 text-white font-semibold py-3 px-6 rounded-xl transition-colors"
          >
            Open Terminal
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-32 h-full flex flex-col">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-[10px] font-bold tracking-[0.2em] text-white/30 uppercase mb-1">Plugin</h2>
          <h1 className="text-2xl font-bold tracking-tight">Claude Terminal</h1>
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 text-xs ${isConnected ? 'text-emerald-400' : 'text-white/30'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-emerald-400' : 'bg-white/30'}`} />
            {isConnected ? 'Connected' : 'Disconnected'}
          </span>
          <button
            onClick={handleRestart}
            className="px-3 py-1.5 text-xs bg-white/5 hover:bg-white/10 rounded-lg transition-colors"
          >
            Restart
          </button>
          <button
            onClick={() => setShowConfig(true)}
            className="px-3 py-1.5 text-xs bg-white/5 hover:bg-white/10 rounded-lg transition-colors"
          >
            Settings
          </button>
        </div>
      </div>

      <div className="text-xs text-white/40 mb-3 font-mono">
        {cwd || 'No directory set'}
      </div>

      <div
        ref={terminalRef}
        className="flex-1 min-h-[500px] bg-[#0a0a0a] rounded-xl overflow-hidden border border-white/[0.06]"
        style={{ padding: '12px' }}
      />
    </div>
  );
};
