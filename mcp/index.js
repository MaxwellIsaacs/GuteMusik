#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const config = {
  url: process.env.NAVIDROME_URL || "http://localhost:4533",
  username: process.env.NAVIDROME_USERNAME,
  password: process.env.NAVIDROME_PASSWORD,
};

if (!config.username || !config.password) {
  console.error("NAVIDROME_USERNAME and NAVIDROME_PASSWORD are required");
  process.exit(1);
}

// Subsonic API helper
async function subsonicRequest(endpoint, params = {}) {
  const url = new URL(`${config.url}/rest/${endpoint}`);
  url.searchParams.set("u", config.username);
  url.searchParams.set("p", config.password);
  url.searchParams.set("v", "1.16.1");
  url.searchParams.set("c", "LuminaMCP");
  url.searchParams.set("f", "json");

  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      value.forEach((v) => url.searchParams.append(key, v));
    } else if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url.toString());
  const data = await response.json();

  if (data["subsonic-response"].status === "failed") {
    throw new Error(data["subsonic-response"].error?.message || "API error");
  }

  return data["subsonic-response"];
}

function formatDuration(seconds) {
  if (!seconds) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function formatTrack(song) {
  return {
    id: song.id,
    title: song.title || "Unknown",
    artist: song.artist || "Unknown",
    album: song.album || "Unknown",
    duration: formatDuration(song.duration),
    year: song.year,
  };
}

function formatAlbum(album) {
  return {
    id: album.id,
    title: album.name || album.title || "Unknown",
    artist: album.artist || "Unknown",
    year: album.year,
    trackCount: album.songCount || 0,
  };
}

// Create MCP server
const server = new McpServer({
  name: "lumina-mcp",
  version: "1.0.0",
});

// Search tool
server.tool(
  "search",
  "Search for songs, albums, and artists in the music library",
  {
    query: { type: "string", description: "Search query" },
    type: {
      type: "string",
      description: "Type to search: 'all', 'songs', 'albums', 'artists'",
      default: "all",
    },
  },
  async ({ query, type = "all" }) => {
    const data = await subsonicRequest("search3", {
      query,
      songCount: type === "all" || type === "songs" ? 20 : 0,
      albumCount: type === "all" || type === "albums" ? 10 : 0,
      artistCount: type === "all" || type === "artists" ? 10 : 0,
    });

    const result = data.searchResult3 || {};
    const output = [];

    if (result.song?.length) {
      output.push("## Songs");
      result.song.forEach((s) => {
        const t = formatTrack(s);
        output.push(`- **${t.title}** by ${t.artist} (${t.album}) [${t.duration}] — id: ${t.id}`);
      });
    }

    if (result.album?.length) {
      output.push("\n## Albums");
      result.album.forEach((a) => {
        const album = formatAlbum(a);
        output.push(`- **${album.title}** by ${album.artist} (${album.year || "?"}) — id: ${album.id}`);
      });
    }

    if (result.artist?.length) {
      output.push("\n## Artists");
      result.artist.forEach((a) => {
        output.push(`- **${a.name}** (${a.albumCount || 0} albums) — id: ${a.id}`);
      });
    }

    return { content: [{ type: "text", text: output.join("\n") || "No results found." }] };
  }
);

// Get album tracks
server.tool(
  "get_album",
  "Get all tracks from an album by album ID",
  {
    albumId: { type: "string", description: "Album ID" },
  },
  async ({ albumId }) => {
    const data = await subsonicRequest("getAlbum", { id: albumId });
    const album = data.album;
    const tracks = (album.song || []).map(formatTrack);

    const output = [`# ${album.name} by ${album.artist}`, `Year: ${album.year || "Unknown"}`, ""];
    tracks.forEach((t, i) => {
      output.push(`${i + 1}. ${t.title} [${t.duration}] — id: ${t.id}`);
    });

    return { content: [{ type: "text", text: output.join("\n") }] };
  }
);

// List playlists
server.tool("list_playlists", "List all playlists", {}, async () => {
  const data = await subsonicRequest("getPlaylists");
  const playlists = data.playlists?.playlist || [];

  if (!playlists.length) {
    return { content: [{ type: "text", text: "No playlists found." }] };
  }

  const output = ["# Playlists", ""];
  playlists.forEach((p) => {
    output.push(`- **${p.name}** (${p.songCount} tracks) — id: ${p.id}`);
  });

  return { content: [{ type: "text", text: output.join("\n") }] };
});

// Get playlist tracks
server.tool(
  "get_playlist",
  "Get all tracks in a playlist",
  {
    playlistId: { type: "string", description: "Playlist ID" },
  },
  async ({ playlistId }) => {
    const data = await subsonicRequest("getPlaylist", { id: playlistId });
    const playlist = data.playlist;
    const tracks = (playlist.entry || []).map(formatTrack);

    const output = [`# ${playlist.name}`, playlist.comment || "", ""];
    tracks.forEach((t, i) => {
      output.push(`${i + 1}. ${t.title} by ${t.artist} [${t.duration}] — id: ${t.id}`);
    });

    return { content: [{ type: "text", text: output.join("\n") }] };
  }
);

// Create playlist
server.tool(
  "create_playlist",
  "Create a new playlist, optionally with initial tracks",
  {
    name: { type: "string", description: "Playlist name" },
    songIds: {
      type: "array",
      items: { type: "string" },
      description: "Optional array of song IDs to add",
    },
  },
  async ({ name, songIds = [] }) => {
    const params = { name };
    if (songIds.length) {
      params.songId = songIds;
    }

    await subsonicRequest("createPlaylist", params);
    return { content: [{ type: "text", text: `Created playlist "${name}" with ${songIds.length} tracks.` }] };
  }
);

// Add tracks to playlist
server.tool(
  "add_to_playlist",
  "Add tracks to an existing playlist",
  {
    playlistId: { type: "string", description: "Playlist ID" },
    songIds: {
      type: "array",
      items: { type: "string" },
      description: "Array of song IDs to add",
    },
  },
  async ({ playlistId, songIds }) => {
    await subsonicRequest("updatePlaylist", {
      playlistId,
      songIdToAdd: songIds,
    });
    return { content: [{ type: "text", text: `Added ${songIds.length} tracks to playlist.` }] };
  }
);

// Remove tracks from playlist
server.tool(
  "remove_from_playlist",
  "Remove tracks from a playlist by index",
  {
    playlistId: { type: "string", description: "Playlist ID" },
    indices: {
      type: "array",
      items: { type: "number" },
      description: "Array of track indices (0-based) to remove",
    },
  },
  async ({ playlistId, indices }) => {
    await subsonicRequest("updatePlaylist", {
      playlistId,
      songIndexToRemove: indices,
    });
    return { content: [{ type: "text", text: `Removed ${indices.length} tracks from playlist.` }] };
  }
);

// Delete playlist
server.tool(
  "delete_playlist",
  "Delete a playlist",
  {
    playlistId: { type: "string", description: "Playlist ID" },
  },
  async ({ playlistId }) => {
    await subsonicRequest("deletePlaylist", { id: playlistId });
    return { content: [{ type: "text", text: "Playlist deleted." }] };
  }
);

// Star/favorite item
server.tool(
  "star",
  "Add a song, album, or artist to favorites",
  {
    id: { type: "string", description: "Item ID" },
    type: {
      type: "string",
      description: "Type: 'song', 'album', or 'artist'",
      default: "song",
    },
  },
  async ({ id, type = "song" }) => {
    const params = {};
    if (type === "album") params.albumId = id;
    else if (type === "artist") params.artistId = id;
    else params.id = id;

    await subsonicRequest("star", params);
    return { content: [{ type: "text", text: `Starred ${type}.` }] };
  }
);

// Unstar item
server.tool(
  "unstar",
  "Remove a song, album, or artist from favorites",
  {
    id: { type: "string", description: "Item ID" },
    type: {
      type: "string",
      description: "Type: 'song', 'album', or 'artist'",
      default: "song",
    },
  },
  async ({ id, type = "song" }) => {
    const params = {};
    if (type === "album") params.albumId = id;
    else if (type === "artist") params.artistId = id;
    else params.id = id;

    await subsonicRequest("unstar", params);
    return { content: [{ type: "text", text: `Unstarred ${type}.` }] };
  }
);

// Get starred/favorites
server.tool("get_favorites", "Get all starred songs and albums", {}, async () => {
  const data = await subsonicRequest("getStarred2");
  const starred = data.starred2 || {};

  const output = [];

  if (starred.song?.length) {
    output.push("## Favorite Songs");
    starred.song.forEach((s) => {
      const t = formatTrack(s);
      output.push(`- **${t.title}** by ${t.artist} — id: ${t.id}`);
    });
  }

  if (starred.album?.length) {
    output.push("\n## Favorite Albums");
    starred.album.forEach((a) => {
      const album = formatAlbum(a);
      output.push(`- **${album.title}** by ${album.artist} — id: ${album.id}`);
    });
  }

  return { content: [{ type: "text", text: output.join("\n") || "No favorites yet." }] };
});

// Get random songs
server.tool(
  "get_random_songs",
  "Get random songs from the library",
  {
    count: { type: "number", description: "Number of songs (default 20)", default: 20 },
    genre: { type: "string", description: "Optional genre filter" },
    fromYear: { type: "number", description: "Optional start year" },
    toYear: { type: "number", description: "Optional end year" },
  },
  async ({ count = 20, genre, fromYear, toYear }) => {
    const params = { size: count };
    if (genre) params.genre = genre;
    if (fromYear) params.fromYear = fromYear;
    if (toYear) params.toYear = toYear;

    const data = await subsonicRequest("getRandomSongs", params);
    const songs = (data.randomSongs?.song || []).map(formatTrack);

    const output = ["# Random Songs", ""];
    songs.forEach((t) => {
      output.push(`- **${t.title}** by ${t.artist} (${t.album}) [${t.duration}] — id: ${t.id}`);
    });

    return { content: [{ type: "text", text: output.join("\n") }] };
  }
);

// Get artist albums
server.tool(
  "get_artist",
  "Get all albums by an artist",
  {
    artistId: { type: "string", description: "Artist ID" },
  },
  async ({ artistId }) => {
    const data = await subsonicRequest("getArtist", { id: artistId });
    const artist = data.artist;
    const albums = (artist.album || []).map(formatAlbum);

    const output = [`# ${artist.name}`, `${albums.length} albums`, ""];
    albums.forEach((a) => {
      output.push(`- **${a.title}** (${a.year || "?"}, ${a.trackCount} tracks) — id: ${a.id}`);
    });

    return { content: [{ type: "text", text: output.join("\n") }] };
  }
);

// Get recently played
server.tool(
  "get_recently_played",
  "Get recently played songs",
  {
    count: { type: "number", description: "Number of songs (default 20)", default: 20 },
  },
  async ({ count = 20 }) => {
    // Navidrome uses getAlbumList2 with type=recent for recently played albums
    const data = await subsonicRequest("getAlbumList2", { type: "recent", size: count });
    const albums = (data.albumList2?.album || []).map(formatAlbum);

    const output = ["# Recently Played Albums", ""];
    albums.forEach((a) => {
      output.push(`- **${a.title}** by ${a.artist} — id: ${a.id}`);
    });

    return { content: [{ type: "text", text: output.join("\n") }] };
  }
);

// ============ QUEUE TOOLS ============

const QUEUE_PLAYLIST_NAME = "Claude Queue";

// Helper to find or create the Claude Queue playlist
async function getOrCreateQueuePlaylist() {
  const data = await subsonicRequest("getPlaylists");
  const playlists = data.playlists?.playlist || [];
  const existing = playlists.find((p) => p.name === QUEUE_PLAYLIST_NAME);

  if (existing) {
    return existing.id;
  }

  // Create the playlist
  await subsonicRequest("createPlaylist", { name: QUEUE_PLAYLIST_NAME });

  // Fetch again to get the ID
  const data2 = await subsonicRequest("getPlaylists");
  const created = (data2.playlists?.playlist || []).find((p) => p.name === QUEUE_PLAYLIST_NAME);
  return created?.id;
}

// Helper to clear a playlist
async function clearPlaylist(playlistId) {
  const data = await subsonicRequest("getPlaylist", { id: playlistId });
  const trackCount = data.playlist?.entry?.length || 0;

  if (trackCount > 0) {
    // Remove all tracks by index (0 to n-1)
    const indices = Array.from({ length: trackCount }, (_, i) => i);
    await subsonicRequest("updatePlaylist", {
      playlistId,
      songIndexToRemove: indices,
    });
  }
}

// Get queue
server.tool(
  "get_queue",
  "Get the current play queue",
  {},
  async () => {
    const data = await subsonicRequest("getPlayQueue");
    const queue = data.playQueue;

    if (!queue?.entry?.length) {
      return { content: [{ type: "text", text: "Queue is empty." }] };
    }

    const tracks = queue.entry.map(formatTrack);
    const currentId = queue.current;

    const output = ["# Current Queue", ""];
    tracks.forEach((t, i) => {
      const marker = t.id === currentId ? "▶ " : "  ";
      output.push(`${marker}${i + 1}. **${t.title}** by ${t.artist} [${t.duration}] — id: ${t.id}`);
    });

    return { content: [{ type: "text", text: output.join("\n") }] };
  }
);

// Queue songs (append to existing queue)
server.tool(
  "queue_songs",
  "Add songs to the play queue. Also syncs to 'Claude Queue' playlist in Lumina.",
  {
    songIds: {
      type: "array",
      items: { type: "string" },
      description: "Array of song IDs to add to the queue",
    },
  },
  async ({ songIds }) => {
    if (!songIds?.length) {
      return { content: [{ type: "text", text: "No songs provided." }] };
    }

    // Get existing queue
    const data = await subsonicRequest("getPlayQueue");
    const existingIds = (data.playQueue?.entry || []).map((e) => e.id);
    const currentId = data.playQueue?.current || songIds[0];

    // Merge: existing + new
    const allIds = [...existingIds, ...songIds];

    // Save to Navidrome play queue
    await subsonicRequest("savePlayQueue", {
      id: allIds,
      current: currentId,
    });

    // Also sync to Claude Queue playlist for visibility in Lumina
    const playlistId = await getOrCreateQueuePlaylist();
    if (playlistId) {
      await subsonicRequest("updatePlaylist", {
        playlistId,
        songIdToAdd: songIds,
      });
    }

    return {
      content: [{
        type: "text",
        text: `Added ${songIds.length} songs to queue (${allIds.length} total). Check "Claude Queue" playlist in Lumina to play.`
      }]
    };
  }
);

// Set queue (replace entire queue)
server.tool(
  "set_queue",
  "Replace the entire play queue with new songs. Also syncs to 'Claude Queue' playlist.",
  {
    songIds: {
      type: "array",
      items: { type: "string" },
      description: "Array of song IDs for the new queue",
    },
  },
  async ({ songIds }) => {
    if (!songIds?.length) {
      return { content: [{ type: "text", text: "No songs provided." }] };
    }

    // Save to Navidrome play queue
    await subsonicRequest("savePlayQueue", {
      id: songIds,
      current: songIds[0],
    });

    // Sync to Claude Queue playlist
    const playlistId = await getOrCreateQueuePlaylist();
    if (playlistId) {
      await clearPlaylist(playlistId);
      await subsonicRequest("updatePlaylist", {
        playlistId,
        songIdToAdd: songIds,
      });
    }

    return {
      content: [{
        type: "text",
        text: `Queue set to ${songIds.length} songs. Check "Claude Queue" playlist in Lumina to play.`
      }]
    };
  }
);

// Clear queue
server.tool(
  "clear_queue",
  "Clear the play queue",
  {},
  async () => {
    // Clear Navidrome play queue by saving empty
    await subsonicRequest("savePlayQueue", { id: [] });

    // Also clear the Claude Queue playlist
    const playlistId = await getOrCreateQueuePlaylist();
    if (playlistId) {
      await clearPlaylist(playlistId);
    }

    return { content: [{ type: "text", text: "Queue cleared." }] };
  }
);

// Queue an entire album
server.tool(
  "queue_album",
  "Add all tracks from an album to the queue",
  {
    albumId: { type: "string", description: "Album ID" },
    prepend: { type: "boolean", description: "If true, add to front of queue", default: false },
  },
  async ({ albumId, prepend = false }) => {
    // Get album tracks
    const albumData = await subsonicRequest("getAlbum", { id: albumId });
    const album = albumData.album;
    const trackIds = (album.song || []).map((s) => s.id);

    if (!trackIds.length) {
      return { content: [{ type: "text", text: "Album has no tracks." }] };
    }

    // Get existing queue
    const queueData = await subsonicRequest("getPlayQueue");
    const existingIds = (queueData.playQueue?.entry || []).map((e) => e.id);

    // Merge
    const allIds = prepend ? [...trackIds, ...existingIds] : [...existingIds, ...trackIds];
    const currentId = prepend ? trackIds[0] : (queueData.playQueue?.current || trackIds[0]);

    // Save queue
    await subsonicRequest("savePlayQueue", {
      id: allIds,
      current: currentId,
    });

    // Sync to Claude Queue playlist
    const playlistId = await getOrCreateQueuePlaylist();
    if (playlistId) {
      if (prepend) {
        // For prepend, we need to recreate the playlist
        await clearPlaylist(playlistId);
        await subsonicRequest("updatePlaylist", {
          playlistId,
          songIdToAdd: allIds,
        });
      } else {
        await subsonicRequest("updatePlaylist", {
          playlistId,
          songIdToAdd: trackIds,
        });
      }
    }

    return {
      content: [{
        type: "text",
        text: `Added "${album.name}" (${trackIds.length} tracks) to queue. Check "Claude Queue" playlist in Lumina.`
      }]
    };
  }
);

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Lumina MCP server running");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
