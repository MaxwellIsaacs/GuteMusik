// GuteMusik Plugin Template
// This file gets bundled into index.js

// Access React from the global GuteMusik API (don't import it)
const { React } = window.GuteMusik;
const { useState, useEffect } = React;

// Define your plugin view component
// It receives these props from GuteMusik:
// - onPlayTrack(track, queue?) - Play a track
// - onNavigateToAlbum(id) - Navigate to album view
// - onNavigateToArtist(id) - Navigate to artist view
// - onContextMenu(event, item, type) - Show context menu
// - onToast(message) - Show a toast notification
const MyPluginView = ({ onToast }) => {
  const [count, setCount] = useState(0);

  return React.createElement('div', { className: 'p-8' },
    React.createElement('h1', { className: 'text-4xl font-bold text-white mb-4' }, 'My Plugin'),
    React.createElement('p', { className: 'text-white/60 mb-8' }, 'This is a custom plugin!'),
    React.createElement('div', { className: 'flex items-center gap-4' },
      React.createElement('button', {
        className: 'px-6 py-3 bg-white text-black rounded-full font-bold hover:scale-105 transition-transform',
        onClick: () => {
          setCount(c => c + 1);
          onToast(`Count: ${count + 1}`);
        }
      }, `Clicked ${count} times`)
    )
  );
};

// Register the plugin with GuteMusik
window.GuteMusik.registerPlugin({
  id: 'my-plugin',        // Must match manifest.json id
  label: 'My Plugin',     // Shown in sidebar
  icon: 'music-note',     // ChromeIcon name (see ChromeIcon.tsx for options)
  view: MyPluginView,     // Your React component
});
