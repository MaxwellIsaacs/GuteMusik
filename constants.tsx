import React from 'react';
import { Album, Track, Playlist, Artist } from './types';
import { PLACEHOLDER_COVER } from './utils/placeholders';

// Deterministic mock data generation
export const MOCK_LIBRARY: Album[] = Array.from({ length: 24 }).map((_, i) => {
  const trackCount = Math.floor(Math.random() * 20) + 1;
  const isMajorWork = trackCount > 10;
  return {
    id: `alb-${i}`,
    title: isMajorWork ? `LP Complex ${i + 1}` : `EP Minor ${i + 1}`,
    artist: i % 2 === 0 ? "Artificial Sound" : "The Algorithm",
    trackCount,
    format: Math.random() > 0.5 ? 'FLAC' : '320kbps',
    size: isMajorWork ? 'large' : 'small',
    cover: PLACEHOLDER_COVER
  };
});

export const MOCK_TRACKS: Track[] = Array.from({ length: 12 }).map((_, i) => ({
  id: `tr-${i}`,
  title: `Signal Flow ${i + 1}`,
  artist: "The Algorithm",
  album: "Polymorphic Code",
  duration: "3:45",
  bitrate: "24-bit / 48kHz",
  format: "FLAC",
  liked: i % 3 === 0,
  cover: PLACEHOLDER_COVER
}));

export const QUEUE_TRACKS = Array.from({ length: 8 }).map((_, i) => ({
  id: `q-${i}`,
  title: `Up Next ${i + 1}`,
  artist: "Future Sounds",
  cover: PLACEHOLDER_COVER
}));

export const MOCK_PLAYLISTS: Playlist[] = [
  { id: 'pl-1', title: 'Midnight Manifesto', cover: PLACEHOLDER_COVER, desc: 'Neon memories.', count: 12 },
  { id: 'pl-2', title: 'Deep Focus', cover: PLACEHOLDER_COVER, desc: 'For deep work sessions.', count: 45 },
  { id: 'pl-3', title: 'Analog Warmth', cover: PLACEHOLDER_COVER, desc: 'Vinyl crackles and tape hiss.', count: 20 },
  { id: 'pl-4', title: 'Gym Phonk', cover: PLACEHOLDER_COVER, desc: 'High energy drift music.', count: 32 },
  { id: 'pl-5', title: 'Sleep Cycle', cover: PLACEHOLDER_COVER, desc: 'Ambient drifting.', count: 8 },
  { id: 'pl-6', title: 'Data Stream', cover: PLACEHOLDER_COVER, desc: 'Glitch and IDM.', count: 15 },
];

export const MOCK_ARTISTS: Artist[] = [
  { id: 'art-1', name: 'The Algorithm', genre: 'Progressive Metal / Electronic', albumCount: 8, cover: PLACEHOLDER_COVER, desc: 'Pioneering the fusion of complex progressive metal riffs with glitchy electronic soundscapes.' },
  { id: 'art-2', name: 'Carbon Based Lifeforms', genre: 'Ambient / Psybient', albumCount: 6, cover: PLACEHOLDER_COVER, desc: 'Swedish ambient music duo formed by Johannes Hedberg and Daniel Segerstad.' },
  { id: 'art-3', name: 'Carpenter Brut', genre: 'Synthwave / Darksynth', albumCount: 4, cover: PLACEHOLDER_COVER, desc: 'French synthwave artist known for mixing horror film soundtracks with metal and electronic music.' },
  { id: 'art-4', name: 'Tycho', genre: 'Chillwave / Ambient', albumCount: 5, cover: PLACEHOLDER_COVER, desc: 'Ambient music project led by Scott Hansen as primary composer, songwriter and producer.' },
  { id: 'art-5', name: 'Jon Hopkins', genre: 'Electronica / Techno', albumCount: 9, cover: PLACEHOLDER_COVER, desc: 'English musician and producer who writes and performs electronic music.' },
  { id: 'art-6', name: 'Nils Frahm', genre: 'Modern Classical', albumCount: 12, cover: PLACEHOLDER_COVER, desc: 'German musician, composer and record producer based in Berlin.' },
  { id: 'art-7', name: 'Bonobo', genre: 'Downtempo / Trip Hop', albumCount: 7, cover: PLACEHOLDER_COVER, desc: 'British musician, producer and DJ Simon Green.' },
  { id: 'art-8', name: 'Four Tet', genre: 'Electronic / IDM', albumCount: 10, cover: PLACEHOLDER_COVER, desc: 'Post-rock and electronic musician Kieran Hebden.' },
];