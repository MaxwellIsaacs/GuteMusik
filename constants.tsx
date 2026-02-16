import React from 'react';
import { Album, Track, Playlist, Artist } from './types';

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
    // Using picsum as requested
    cover: `https://picsum.photos/seed/${i + 100}/800/800`
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
  cover: `https://picsum.photos/seed/${i + 200}/200/200`
}));

export const QUEUE_TRACKS = Array.from({ length: 8 }).map((_, i) => ({
  id: `q-${i}`,
  title: `Up Next ${i + 1}`,
  artist: "Future Sounds",
  cover: `https://picsum.photos/seed/${i + 500}/400/400`
}));

export const MOCK_PLAYLISTS: Playlist[] = [
  { id: 'pl-1', title: 'Midnight Manifesto', cover: 'https://picsum.photos/seed/playlistMain/800/800', desc: 'Neon memories.', count: 12 },
  { id: 'pl-2', title: 'Deep Focus', cover: 'https://picsum.photos/seed/focus/800/800', desc: 'For deep work sessions.', count: 45 },
  { id: 'pl-3', title: 'Analog Warmth', cover: 'https://picsum.photos/seed/analog/800/800', desc: 'Vinyl crackles and tape hiss.', count: 20 },
  { id: 'pl-4', title: 'Gym Phonk', cover: 'https://picsum.photos/seed/gym/800/800', desc: 'High energy drift music.', count: 32 },
  { id: 'pl-5', title: 'Sleep Cycle', cover: 'https://picsum.photos/seed/sleep/800/800', desc: 'Ambient drifting.', count: 8 },
  { id: 'pl-6', title: 'Data Stream', cover: 'https://picsum.photos/seed/data/800/800', desc: 'Glitch and IDM.', count: 15 },
];

export const MOCK_ARTISTS: Artist[] = [
  { id: 'art-1', name: 'The Algorithm', genre: 'Progressive Metal / Electronic', albumCount: 8, cover: 'https://picsum.photos/seed/art1/800/800', desc: 'Pioneering the fusion of complex progressive metal riffs with glitchy electronic soundscapes.' },
  { id: 'art-2', name: 'Carbon Based Lifeforms', genre: 'Ambient / Psybient', albumCount: 6, cover: 'https://picsum.photos/seed/art2/800/800', desc: 'Swedish ambient music duo formed by Johannes Hedberg and Daniel Segerstad.' },
  { id: 'art-3', name: 'Carpenter Brut', genre: 'Synthwave / Darksynth', albumCount: 4, cover: 'https://picsum.photos/seed/art3/800/800', desc: 'French synthwave artist known for mixing horror film soundtracks with metal and electronic music.' },
  { id: 'art-4', name: 'Tycho', genre: 'Chillwave / Ambient', albumCount: 5, cover: 'https://picsum.photos/seed/art4/800/800', desc: 'Ambient music project led by Scott Hansen as primary composer, songwriter and producer.' },
  { id: 'art-5', name: 'Jon Hopkins', genre: 'Electronica / Techno', albumCount: 9, cover: 'https://picsum.photos/seed/art5/800/800', desc: 'English musician and producer who writes and performs electronic music.' },
  { id: 'art-6', name: 'Nils Frahm', genre: 'Modern Classical', albumCount: 12, cover: 'https://picsum.photos/seed/art6/800/800', desc: 'German musician, composer and record producer based in Berlin.' },
  { id: 'art-7', name: 'Bonobo', genre: 'Downtempo / Trip Hop', albumCount: 7, cover: 'https://picsum.photos/seed/art7/800/800', desc: 'British musician, producer and DJ Simon Green.' },
  { id: 'art-8', name: 'Four Tet', genre: 'Electronic / IDM', albumCount: 10, cover: 'https://picsum.photos/seed/art8/800/800', desc: 'Post-rock and electronic musician Kieran Hebden.' },
];