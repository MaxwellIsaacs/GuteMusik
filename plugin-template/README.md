# GuteMusik Plugin Template

Create custom plugins for GuteMusik.

## Quick Start

1. Edit `manifest.json` with your plugin info
2. Edit `index.tsx` with your plugin code
3. Build with `./build.sh`
4. Import the `.gutemusik` file in GuteMusik Settings

## Plugin Structure

```
my-plugin/
├── manifest.json    # Plugin metadata
├── index.tsx        # Plugin source code
├── index.js         # Bundled output (generated)
└── my-plugin.gutemusik  # Final package (generated)
```

## manifest.json

```json
{
  "id": "my-plugin",           // Unique identifier (lowercase, no spaces)
  "name": "My Plugin",         // Display name
  "version": "1.0.0",          // Semver version
  "author": "Your Name",       // Optional
  "description": "...",        // Optional
  "icon": "music-note"         // ChromeIcon name
}
```

## Available Icons

See `components/ChromeIcon.tsx` for the full list. Common ones:
- `music-note`, `equalizer`, `download`, `terminal`
- `settings`, `search`, `heart`, `play`, `pause`
- `folder`, `list`, `grid`, `star`

## Plugin API

Your plugin component receives these props:

```typescript
interface PluginViewProps {
  onPlayTrack: (track: Track, queue?: Track[]) => void;
  onNavigateToAlbum: (id: string) => void;
  onNavigateToArtist: (id: string) => void;
  onContextMenu: (e: React.MouseEvent, item: any, type: string) => void;
  onToast: (msg: string) => void;
}
```

Access React via `window.GuteMusik.React`:

```javascript
const { React } = window.GuteMusik;
const { useState, useEffect, useCallback } = React;
```

## Building Without esbuild

If you don't want to use esbuild, you can write plain JavaScript:

```javascript
// index.js (no build step needed)
const { React } = window.GuteMusik;

const MyView = (props) => {
  return React.createElement('div', null, 'Hello!');
};

window.GuteMusik.registerPlugin({
  id: 'my-plugin',
  label: 'My Plugin',
  icon: 'star',
  view: MyView,
});
```

Then manually zip `manifest.json` and `index.js`:
```bash
zip my-plugin.gutemusik manifest.json index.js
```

## Tips

- Use Tailwind CSS classes for styling (already loaded)
- Test in dev mode: `npm run tauri:dev`
- Check console for errors if plugin doesn't load
