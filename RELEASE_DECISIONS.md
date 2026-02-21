# Lumina Release Decisions

Go through each section. Mark your decision for every item, then hand this back.

---

## How to use this file

For each item, replace the `[ ]` with your choice:

- `[K]` = **Keep** and finish implementing
- `[X]` = **Scrap** and remove from the codebase
- `[?]` = **Not sure** — discuss further

---

## 1. Non-functional UI elements

These are buttons/features that exist in the UI but do nothing or show a generic toast when clicked. Non-technical users will click them and think the app is broken.

### Context menu actions (right-click on a track)

"Play Now", "Add to Queue", and "Love Track" all work. These three don't:

- [k ] **Download** — `components/ui/ContextMenu.tsx:34`
  Shows toast only. Would need integration with the downloader plugin backend.

- [x ] **Start Radio** — `components/ui/ContextMenu.tsx:35`
  Shows toast only. Would require building a "similar tracks" algorithm or using Subsonic's `getSimilarSongs` endpoint to auto-populate a queue. Significant work.

- [x ] **Share Link** — `components/ui/ContextMenu.tsx:36`
  Shows toast only. Would need a shareable URL scheme or clipboard copy of server link.

### New Playlist wizard

- [k and make much better ] **New Playlist modal** — `App.tsx:274-288`, triggered from Sidebar
  Shows a "Step 01 — Name your creation" dialog with an input field and a "Finish" button. The input value is never captured. Clicking Finish shows a toast "Playlist Created" but nothing is actually created. The Subsonic API supports playlist creation — this just needs to be wired up.


## 2. Plugin system

### Existing plugins

- [K ] **Downloader plugin** — `plugins/downloader/`, `src-tauri/src/plugins/downloader.rs` (1,170 lines of Rust)
  ~95% complete. Three tabs (Albums via MusicBrainz, Songs via YouTube, Manual entry) all functional. Missing: format preference selector and cover art fallback. The Rust backend is fully implemented. This is real, working code.

- [ K but there is bullshit to redo here] **Stats plugin** — `plugins/example-stats/`
  Fully functional despite the "example-" prefix. 4 tabs, 20+ visualization types, library health scores, genre breakdowns. Works as-is. The "example-" prefix may confuse contributors into thinking it's throwaway.

### Plugin system itself

- [K but add doc and claude SKILL file for plugins] **Keep the plugin architecture** — `plugins/index.ts`, `types.ts` (PluginDefinition interface)
  Clean interface, easy to extend. If you keep it, consider documenting how third parties would write a plugin. If you scrap it, the downloader and stats features would need to become built-in views instead.

---

## 3. MCP server (Claude integration)

- [K ] **MCP server** — `mcp/` directory
  Currently exposes search only. The server works and is a genuine differentiator. The question is whether to keep it as a headline feature (and expand it to cover playback, queues, playlists, favorites) or treat it as a side experiment.

  If keeping: [ K] Expand to full playback control  /  [ ] Ship with search-only for now
I redid the audio engine in rust so it will be easier for the MCP to playback
---

## 4. Auth and security

These affect every user. Not optional for a public release. Keep all

- [ ] **Fix auth to use token path** — `services/subsonic.ts:57-89` vs `110`
  You already wrote token-based auth with MD5 in `buildUrl()`. But `request()` on line 110 calls `buildSimpleUrl()` which sends the plaintext password in every URL. One-line fix to switch `request()` to use `buildUrl()` instead.

- [ ] **Warn on HTTP (non-HTTPS) server URLs** — `views/ServerConfig.tsx`
  Non-technical users connecting to a remote server over plain HTTP won't realize their credentials are unencrypted on the wire. A yellow warning banner when the URL starts with `http://` (and isn't localhost) would help.

- [ ] **Move credential storage to Tauri secure storage** — `context/ServerContext.tsx:119`
  Currently stored as plaintext JSON in localStorage. Tauri has `tauri-plugin-store` with optional encryption. Matters more if users are on shared machines.

---

## 5. Error handling and resilience

Keep, add extensive error handling and logging

- [ ] **Add React Error Boundaries** — Currently absent
  One bad API response in any view crashes the entire app. Wrapping views in error boundaries lets the rest of the app keep working and shows "Something went wrong" instead of a white screen.

- [ ] **Add retry logic on network failures** — `context/ServerContext.tsx`
  Currently a dropped connection means the user must manually reconnect. Auto-retry with exponential backoff (3 attempts) would handle WiFi hiccups silently.

- [ ] **Fix toast messages to show human-readable names** — `App.tsx:204-206`
  Currently shows `"Playing Album ${id}"` — the raw album ID. Should show the album title.

---

## 6. Playlist management gaps

These are in the working PlaylistView, not the broken wizard above. Keep all

- [ ] **Delete playlist** — `views/PlaylistView.tsx`
  No way to delete a playlist. The Subsonic API supports it (`deletePlaylist`).

- [ ] **Remove tracks from playlist** — `views/PlaylistView.tsx`
  No way to remove individual tracks from a playlist.

- [ ] **Reorder tracks in playlist** — `views/PlaylistView.tsx`
  No drag-to-reorder. Subsonic API supports `updatePlaylist` with index changes.

---

## 7. Performance (matters for large libraries). Do these

- [ ] **Add virtual scrolling** — Library grid, queue view, playlist track list
  Currently renders every album/track as a DOM element. Fine for <500 albums, sluggish for 5,000+.

- [ ] **Throttle album cover fetches** — `hooks/useAlbumCover.ts`
  A large library fires hundreds of concurrent image requests on first load.

- [ ] **Replace picsum.photos fallback** — `hooks/useAlbumCover.ts:7`
  Missing album covers currently show random stock photos from an external service. Should be a local placeholder image (music note icon, gradient, etc.).

---

## 8. Release infrastructure
all

- [ ] **Write a real README** — Current one is a generic AI Studio template mentioning Gemini API keys
- [ ] **Set up Tauri auto-updater** — `tauri-plugin-updater` so users get new versions without re-downloading
- [ ] **Add basic test suite** — At minimum: audio state machine, Subsonic API client, queue/shuffle logic
- [ ] **Rename stats plugin** — Drop the "example-" prefix if keeping it

---

## 9. Accessibility and polish

- [ ] **Keyboard navigation** — Currently only Space (play/pause) and Escape work. No arrow key navigation.
- [ ] **Tooltip on truncated text** — Long album/artist names get cut off with no way to see the full name.
- [ ] **Confirmation dialog on disconnect** — Currently disconnects immediately with no warning.
- [ ] **Default server URL** — `views/ServerConfig.tsx:16` defaults to `http://localhost:4533`. Consider an empty field with placeholder text instead, so users don't think it's pre-configured.

---


Fill this in and hand it back. I'll implement the keeps and cleanly remove the scraps.
