import React, { useState } from 'react';
import { HardDrives, CircleNotch, Warning } from '@phosphor-icons/react';
import { ChromeIcon } from '../components/ChromeIcon';
import { useServer } from '../context/ServerContext';
import { usePlatform } from '../hooks/usePlatform';

interface ServerConfigProps {
    onClose: () => void;
    onConnect: () => void;
}

export const ServerConfig: React.FC<ServerConfigProps> = ({ onClose, onConnect }) => {
    const { isLinux } = usePlatform();
    const { state, connect, disconnect } = useServer();

    const [serverUrl, setServerUrl] = useState('http://localhost:4533');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [localError, setLocalError] = useState<string | null>(null);

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
        disconnect();
    };

    const error = localError || state.error;

    // Show connected state
    if (state.isConnected) {
        return (
            <div className="animate-fade-in w-full max-w-3xl mx-auto pt-20 pb-40">
                <div className="w-full bg-[#0a0a0a] border border-white/10 rounded-3xl p-12 relative shadow-2xl overflow-hidden">
                    <div className={`absolute top-0 right-0 p-32 bg-purple-500/10 rounded-full ${isLinux ? 'opacity-40' : 'blur-[100px]'} pointer-events-none`}></div>

                    <div className="text-center mb-12 relative z-10">
                        <div className="w-20 h-20 bg-gradient-to-tr from-purple-500 to-violet-500 rounded-3xl mx-auto mb-6 flex items-center justify-center shadow-[0_0_50px_rgba(147,51,234,0.3)]">
                            <ChromeIcon name="star" size={40} />
                        </div>
                        <h2 className="text-4xl font-bold text-white mb-2">Connected</h2>
                        <p className="text-white/40 text-lg font-mono">{state.serverUrl}</p>
                    </div>

                    <div className="max-w-md mx-auto relative z-10 space-y-4">
                        <button
                            onClick={handleDisconnect}
                            className="w-full py-4 bg-white/10 text-white rounded-xl font-bold hover:bg-white/20 transition-all flex items-center justify-center gap-2"
                        >
                            Disconnect
                        </button>

                        <button
                            onClick={onClose}
                            className="w-full py-2 text-white/30 hover:text-white text-sm transition-colors"
                        >
                            Back to Library
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="animate-fade-in w-full max-w-3xl mx-auto pt-20 pb-40">
            <div className="w-full bg-[#0a0a0a] border border-white/10 rounded-3xl p-12 relative shadow-2xl overflow-hidden">
                <div className={`absolute top-0 right-0 p-32 bg-purple-500/10 rounded-full ${isLinux ? 'opacity-40' : 'blur-[100px]'} pointer-events-none`}></div>

                <div className="text-center mb-12 relative z-10">
                    <div className={`w-20 h-20 bg-gradient-to-tr from-purple-500 to-violet-500 rounded-3xl mx-auto mb-6 flex items-center justify-center shadow-[0_0_50px_rgba(147,51,234,0.3)] ${state.isConnecting ? 'animate-pulse' : ''}`}>
                        <HardDrives size={40} weight="light" className="text-white" />
                    </div>
                    <h2 className="text-4xl font-bold text-white mb-2">Connect Server</h2>
                    <p className="text-white/40 text-lg">Enter your Navidrome details to sync.</p>
                </div>

                {error && (
                    <div className="max-w-md mx-auto mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center gap-3 relative z-10">
                        <Warning size={20} className="text-red-400 flex-shrink-0" />
                        <p className="text-red-400 text-sm">{error}</p>
                    </div>
                )}

                <div className="space-y-6 max-w-md mx-auto relative z-10">
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-white/30 uppercase ml-2">Server URL</label>
                        <input
                            type="text"
                            value={serverUrl}
                            onChange={(e) => setServerUrl(e.target.value)}
                            placeholder="http://localhost:4533"
                            disabled={state.isConnecting}
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-4 text-white placeholder:text-white/20 focus:outline-none focus:border-purple-500/50 focus:bg-white/10 transition-all font-mono text-sm disabled:opacity-50"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-white/30 uppercase ml-2">Username</label>
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            placeholder="username"
                            disabled={state.isConnecting}
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-4 text-white placeholder:text-white/20 focus:outline-none focus:border-purple-500/50 focus:bg-white/10 transition-all font-mono text-sm disabled:opacity-50"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-white/30 uppercase ml-2">Password</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="password"
                            disabled={state.isConnecting}
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-4 text-white placeholder:text-white/20 focus:outline-none focus:border-purple-500/50 focus:bg-white/10 transition-all font-mono text-sm disabled:opacity-50"
                        />
                    </div>

                    <button
                        onClick={handleConnect}
                        disabled={state.isConnecting}
                        className="w-full mt-8 py-4 bg-white text-black rounded-xl font-bold hover:scale-[1.02] transition-transform flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(255,255,255,0.1)] disabled:opacity-50 disabled:hover:scale-100"
                    >
                        {state.isConnecting ? (
                            <>
                                <CircleNotch size={18} weight="bold" className="animate-spin" /> Connecting...
                            </>
                        ) : (
                            <>
                                <ChromeIcon name="power" size={18} /> Connect
                            </>
                        )}
                    </button>

                    <button
                        onClick={onClose}
                        disabled={state.isConnecting}
                        className="w-full py-2 text-white/30 hover:text-white text-sm transition-colors disabled:opacity-50"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
};
