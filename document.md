# Lumina

Lumina is a modern, cross-platform desktop music player built as a client for Navidrome and other Subsonic-compatible music servers.

## What It Is

Lumina is a native desktop application that connects to your self-hosted music server and provides a polished, high-performance listening experience. It combines a React/TypeScript frontend with a Rust backend powered by Tauri, giving you the best of both worlds: a modern web-based UI with native performance and system integration.

### Key Features

- **Library Management** - Browse your music collection by albums, artists, and playlists
- **Native Audio Engine** - High-quality audio playback via Rust-based rodio/symphonia, supporting formats like FLAC, MP3, AAC, and more
- **Full-Screen Player** - Immersive listening mode with album art, lyrics, and playback controls
- **Search** - Instant search across tracks, albums, and artists
- **Queue Management** - Build and manage your play queue with ease
- **Favorites** - Star songs and albums for quick access
- **Playlist Support** - Create, edit, and manage playlists synced with your server
- **Plugin System** - Extensible architecture for additional functionality (includes a downloader plugin)
- **Linux-Optimized** - Performance tuning for smooth operation on Linux desktops

## Why It Exists

### The Problem

Self-hosted music servers like Navidrome solve the problem of owning and streaming your music library, but the client experience can vary widely. Many existing clients are:

- Web-based with browser overhead and no native feel
- Mobile-focused with poor desktop UX
- Electron-heavy with significant resource usage
- Outdated with stale interfaces

### The Solution

Lumina was created to provide:

1. **A native desktop experience** - Using Tauri instead of Electron means a smaller footprint (~10MB vs ~150MB+) and better system integration while still leveraging web technologies for the UI.

2. **High-quality audio** - The Rust audio engine handles decoding and playback natively, avoiding browser audio limitations and providing gapless playback potential.

3. **Modern design** - A visually refined interface with ambient backgrounds, smooth animations, and thoughtful UX that makes browsing your collection enjoyable.

4. **Cross-platform support** - Works on Linux, macOS, and Windows from a single codebase.

5. **Subsonic compatibility** - Connects to any server implementing the Subsonic API (Navidrome, Airsonic, Gonic, etc.), giving users server choice.

## Technical Architecture

```
lumina/
├── App.tsx              # Main React application
├── components/          # UI components (player, sidebar, etc.)
├── views/               # Page views (library, album, artist, etc.)
├── context/             # React contexts (audio, server)
├── services/            # API clients (Subsonic)
├── hooks/               # Custom React hooks
├── plugins/             # Plugin system
└── src-tauri/           # Rust backend
    └── src/
        ├── audio/       # Native audio engine (rodio/symphonia)
        └── plugins/     # Native plugins (downloader)
```

### Stack

- **Frontend**: React 19, TypeScript, TailwindCSS, Vite
- **Backend**: Rust, Tauri 2.x
- **Audio**: rodio, symphonia (Rust audio libraries)
- **API**: Subsonic API v1.16.1

## Getting Started

1. Ensure you have a Navidrome (or Subsonic-compatible) server running
2. Build and run Lumina with `npm run tauri:dev`
3. Configure your server connection in Settings
4. Enjoy your music
