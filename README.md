<p align="center">
  <img src="logo.png" alt="GuteMusik" width="120" />
</p>

<h1 align="center">GuteMusik</h1>

<p align="center">A fast, cross-platform desktop music player for Subsonic servers.</p>

---

## About

GuteMusik connects to Navidrome, Airsonic, Gonic, or any other Subsonic-compatible server. React and TypeScript on the frontend, Rust audio engine, Tauri underneath (NO ELECTRON).

## Features

- Browse by album, artist, playlist, or chronologically
- Native playback of FLAC, MP3, AAC, and more via Rust
- Full-screen player with album art and lyrics
- Search across your whole collection
- Queue management, favorites, starred albums, the works
- Easy playlist creation and editing, synced to your server
- Plugin system for custom components and rust extensions

### Library

![Library View](screenshots/library.png)

### Player

![Player View](screenshots/player.png)

### Search

![Search View](screenshots/search.png)

### Playlists

![Playlists View](screenshots/playlists.png)

### Settings

![Settings View](screenshots/settings.png)

## Install

GuteMusik is in alpha. Builds for Linux, macOS, and Windows.

You need a running Subsonic-compatible server.

### macOS

Grab the `.dmg` from the [releases page](https://github.com/MaxwellIsaacs/gutemusik/releases).

### From Source

```bash
git clone https://github.com/MaxwellIsaacs/gutemusik.git
cd gutemusik
npm install
npm run tauri:dev
```

### Production Build

```bash
npm run tauri:build
```

## Setup

Open GuteMusik, go to Settings, enter your server URL and credentials, and you are good to go.

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, TailwindCSS, Vite |
| Backend | Rust, Tauri 2.x |
| Audio | rodio, symphonia |
| API | Subsonic API v1.16.1 |

## Plugins

Plugins can be written in TypeScript (frontend) or Rust (backend). API still stabilizing.

## Contributing

Contributions welcome. Open an issue first for anything beyond bug fixes.

## License

MIT
