import React, { useState, useRef } from 'react';
import { CircleNotch, Warning, ShieldWarning, Trash, Upload, Folder } from '@phosphor-icons/react';
import { ChromeIcon } from '../components/ChromeIcon';
import { useServer } from '../context/ServerContext';
import { usePlatform } from '../hooks/usePlatform';
import { PluginDefinition } from '../types';

interface ServerConfigProps {
    onClose: () => void;
    onConnect: () => void;
    plugins: PluginDefinition[];
    disabledPlugins: string[];
    onTogglePlugin: (id: string) => void;
    onDeletePlugin: (id: string) => void;
    onImportPlugin: (file: File) => void;
    onImportPluginFolder: (files: FileList) => void;
}

export const ServerConfig: React.FC<ServerConfigProps> = ({
    onClose,
    onConnect,
    plugins,
    disabledPlugins,
    onTogglePlugin,
    onDeletePlugin,
    onImportPlugin,
    onImportPluginFolder,
}) => {
    const { isLinux } = usePlatform();
    const { state, connect, disconnect } = useServer();

    const [serverUrl, setServerUrl] = useState('');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [localError, setLocalError] = useState<string | null>(null);
    const [showConfirmDisconnect, setShowConfirmDisconnect] = useState(false);
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const folderInputRef = useRef<HTMLInputElement>(null);

    const isInsecureRemote = serverUrl.startsWith('http://') && !serverUrl.includes('localhost') && !serverUrl.includes('127.0.0.1');

    const handleConnect = async () => {
        setLocalError(null);

        if (!serverUrl.trim()) {
            setLocalError('Server URL is required');
            return;
        }
        if (!username.trim()) {
            setLocalError('Username is required');
            return;
        }
        if (!password.trim()) {
            setLocalError('Password is required');
            return;
        }

        const success = await connect({
            url: serverUrl.trim(),
            username: username.trim(),
            password: password.trim(),
        });

        if (success) {
            onConnect();
        }
    };

    const handleDisconnect = () => {
        if (!showConfirmDisconnect) {
            setShowConfirmDisconnect(true);
            return;
        }
        disconnect();
        setShowConfirmDisconnect(false);
    };

    const error = localError || state.error;

    const getServerDisplayName = () => {
        if (!state.serverUrl) return null;
        try { return new URL(state.serverUrl).host; } catch { return state.serverUrl; }
    };

    return (
        <div className="animate-fade-in w-full max-w-2xl pb-40">
            {/* Page title */}
            <h1 className="text-5xl font-medium text-white tracking-tighter mb-2">Settings</h1>
            <p className="text-white/30 text-lg mb-16">Server connection and plugins.</p>

            {/* ── Server section ── */}
            <section className="mb-16">
                <h2 className="text-sm font-bold tracking-[0.2em] text-white/40 uppercase mb-6">Server</h2>

                {state.isConnected ? (
                    <div className="space-y-6">
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-full bg-purple-500 flex items-center justify-center text-xs font-bold text-black flex-shrink-0">
                                ND
                            </div>
                            <div className="min-w-0">
                                <p className="text-white font-medium">Navidrome</p>
                                <p className="text-white/30 text-sm font-mono truncate">{getServerDisplayName()}</p>
                            </div>
                            <div className="ml-auto flex items-center gap-2">
                                <span className="text-xs text-purple-400 font-medium px-2 py-1 bg-purple-500/10 rounded-full">Connected</span>
                            </div>
                        </div>

                        {showConfirmDisconnect ? (
                            <div className="flex items-center gap-3 p-4 border border-red-500/20 rounded-xl bg-red-500/5">
                                <p className="text-red-400 text-sm flex-1">Disconnect from this server?</p>
                                <button
                                    onClick={() => setShowConfirmDisconnect(false)}
                                    className="px-4 py-2 text-sm text-white/50 hover:text-white transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleDisconnect}
                                    className="px-4 py-2 text-sm bg-red-500/20 text-red-400 rounded-lg font-medium hover:bg-red-500/30 transition-colors"
                                >
                                    Disconnect
                                </button>
                            </div>
                        ) : (
                            <button
                                onClick={handleDisconnect}
                                className="text-sm text-white/30 hover:text-red-400 transition-colors"
                            >
                                Disconnect
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="space-y-5">
                        {error && (
                            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3">
                                <Warning size={16} className="text-red-400 flex-shrink-0" />
                                <p className="text-red-400 text-sm">{error}</p>
                            </div>
                        )}

                        {isInsecureRemote && (
                            <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-xl flex items-center gap-3">
                                <ShieldWarning size={16} className="text-yellow-400 flex-shrink-0" />
                                <p className="text-yellow-400 text-sm">HTTP — credentials sent unencrypted.</p>
                            </div>
                        )}

                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-white/30 uppercase">Server URL</label>
                            <input
                                type="text"
                                value={serverUrl}
                                onChange={(e) => setServerUrl(e.target.value)}
                                placeholder="http://localhost:4533"
                                disabled={state.isConnecting}
                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 text-white placeholder:text-white/20 focus:outline-none focus:border-white/30 transition-colors font-mono text-sm disabled:opacity-50"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-white/30 uppercase">Username</label>
                                <input
                                    type="text"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    placeholder="username"
                                    disabled={state.isConnecting}
                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 text-white placeholder:text-white/20 focus:outline-none focus:border-white/30 transition-colors font-mono text-sm disabled:opacity-50"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-white/30 uppercase">Password</label>
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="password"
                                    disabled={state.isConnecting}
                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 text-white placeholder:text-white/20 focus:outline-none focus:border-white/30 transition-colors font-mono text-sm disabled:opacity-50"
                                />
                            </div>
                        </div>

                        <button
                            onClick={handleConnect}
                            disabled={state.isConnecting}
                            className="w-full py-3.5 bg-white text-black rounded-xl font-bold hover:bg-white/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            {state.isConnecting ? (
                                <>
                                    <CircleNotch size={16} weight="bold" className="animate-spin" /> Connecting...
                                </>
                            ) : (
                                <>
                                    <ChromeIcon name="power" size={16} /> Connect
                                </>
                            )}
                        </button>
                    </div>
                )}
            </section>

            {/* ── Plugins section ── */}
            <section>
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-sm font-bold tracking-[0.2em] text-white/40 uppercase">Plugins</h2>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => folderInputRef.current?.click()}
                            className="flex items-center gap-2 text-xs font-bold text-white/40 hover:text-white uppercase tracking-wider transition-colors"
                        >
                            <Folder size={14} weight="bold" />
                            Folder
                        </button>
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className="flex items-center gap-2 text-xs font-bold text-white/40 hover:text-white uppercase tracking-wider transition-colors"
                        >
                            <Upload size={14} weight="bold" />
                            File
                        </button>
                    </div>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".gutemusik,.zip"
                        className="hidden"
                        onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                                onImportPlugin(file);
                                e.target.value = '';
                            }
                        }}
                    />
                    <input
                        ref={folderInputRef}
                        type="file"
                        // @ts-ignore - webkitdirectory is a non-standard attribute
                        webkitdirectory=""
                        directory=""
                        multiple
                        className="hidden"
                        onChange={(e) => {
                            const files = e.target.files;
                            if (files && files.length > 0) {
                                onImportPluginFolder(files);
                                e.target.value = '';
                            }
                        }}
                    />
                </div>

                {/* Drag and drop zone */}
                <div
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={(e) => {
                        e.preventDefault();
                        setIsDragging(false);
                        const items = e.dataTransfer.items;
                        if (items.length > 0) {
                            // Check if it's a folder
                            const firstItem = items[0];
                            if (firstItem.webkitGetAsEntry) {
                                const entry = firstItem.webkitGetAsEntry();
                                if (entry?.isDirectory) {
                                    // Handle folder drop via DataTransferItemList
                                    const files = e.dataTransfer.files;
                                    if (files.length > 0) {
                                        onImportPluginFolder(files);
                                    }
                                    return;
                                }
                            }
                            // Otherwise it's a file
                            const file = e.dataTransfer.files[0];
                            if (file && (file.name.endsWith('.gutemusik') || file.name.endsWith('.zip'))) {
                                onImportPlugin(file);
                            }
                        }
                    }}
                    className={`mb-6 p-8 border-2 border-dashed rounded-2xl text-center transition-colors ${
                        isDragging
                            ? 'border-purple-500 bg-purple-500/10'
                            : 'border-white/10 hover:border-white/20'
                    }`}
                >
                    <div className="text-white/30 text-sm">
                        {isDragging ? (
                            <span className="text-purple-400">Drop plugin folder or .gutemusik file</span>
                        ) : (
                            <span>Drag a plugin folder or .gutemusik file here</span>
                        )}
                    </div>
                </div>

                {plugins.length === 0 ? (
                    <div className="py-8 text-center">
                        <p className="text-white/20 text-sm">No plugins installed.</p>
                    </div>
                ) : (
                    <div className="space-y-1">
                        {plugins.map((plugin) => {
                            const isEnabled = !disabledPlugins.includes(plugin.id);
                            const isConfirmingDelete = confirmDeleteId === plugin.id;
                            const IconComponent = typeof plugin.icon === 'string' ? null : plugin.icon;

                            return (
                                <div
                                    key={plugin.id}
                                    className={`group flex items-center gap-4 px-4 py-3.5 rounded-xl transition-colors ${isEnabled ? 'hover:bg-white/5' : 'opacity-40 hover:bg-white/[0.02]'}`}
                                >
                                    {/* Icon */}
                                    <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0">
                                        {typeof plugin.icon === 'string' ? (
                                            <ChromeIcon name={plugin.icon} size={16} />
                                        ) : (
                                            IconComponent && <IconComponent size={16} className="text-white/60" />
                                        )}
                                    </div>

                                    {/* Label */}
                                    <span className="text-sm font-medium text-white flex-1">{plugin.label}</span>

                                    {/* Delete */}
                                    {isConfirmingDelete ? (
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs text-red-400">Delete?</span>
                                            <button
                                                onClick={() => { onDeletePlugin(plugin.id); setConfirmDeleteId(null); }}
                                                className="text-xs text-red-400 font-bold hover:text-red-300 transition-colors"
                                            >
                                                Yes
                                            </button>
                                            <button
                                                onClick={() => setConfirmDeleteId(null)}
                                                className="text-xs text-white/30 hover:text-white transition-colors"
                                            >
                                                No
                                            </button>
                                        </div>
                                    ) : (
                                        <button
                                            onClick={() => setConfirmDeleteId(plugin.id)}
                                            className={`p-1.5 rounded-lg text-white/0 ${isLinux ? 'text-white/20' : 'group-hover:text-white/20'} hover:!text-red-400 hover:bg-red-500/10 transition-colors`}
                                        >
                                            <Trash size={14} />
                                        </button>
                                    )}

                                    {/* Toggle */}
                                    <button
                                        onClick={() => onTogglePlugin(plugin.id)}
                                        className={`relative w-10 h-6 rounded-full transition-colors flex-shrink-0 ${isEnabled ? 'bg-purple-500' : 'bg-white/10'}`}
                                    >
                                        <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${isEnabled ? 'left-5' : 'left-1'}`} />
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )}
            </section>
        </div>
    );
};
