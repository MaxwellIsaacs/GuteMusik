// GuteMusik Plugin Template
// This file gets bundled into index.js via build.sh

// Access React and the plugin API from the global GuteMusik object
const { React, usePluginAPI } = window.GuteMusik;
const { useState } = React;

// Define your plugin view component
// Use usePluginAPI() to access audio, library, navigation, toasts, storage, and IPC
const MyPluginView = () => {
  const api = usePluginAPI();
  const [count, setCount] = useState(0);

  // api.audio    - playback state, controls (play, pause, next, seek, etc.)
  // api.library  - albums, artists, playlists, search, starred items
  // api.nav      - navigateToAlbum(id), navigateToArtist(id)
  // api.ui       - toast(message), contextMenu(event, item, type)
  // api.storage  - get<T>(key), set(key, value), remove(key) — auto-scoped to plugin
  // api.ipc      - invoke(cmd, args), listen(event, handler) — Tauri IPC

  return React.createElement('div', { className: 'p-8' },
    React.createElement('h1', { className: 'text-4xl font-bold text-white mb-4' }, 'My Plugin'),
    React.createElement('p', { className: 'text-white/60 mb-8' }, 'This is a custom plugin!'),
    React.createElement('div', { className: 'flex items-center gap-4' },
      React.createElement('button', {
        className: 'px-6 py-3 bg-white text-black rounded-full font-bold hover:scale-105 transition-transform',
        onClick: () => {
          setCount(c => c + 1);
          api.ui.toast(`Count: ${count + 1}`);
        }
      }, `Clicked ${count} times`)
    )
  );
};

// Register the plugin with GuteMusik
window.GuteMusik.registerPlugin({
  id: 'my-plugin',        // Must match manifest.json id
  label: 'My Plugin',     // Shown in sidebar
  icon: 'music-note',     // ChromeIcon name (see public/ for options)
  view: MyPluginView,     // Your React component
});
