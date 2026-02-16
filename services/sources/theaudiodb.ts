/**
 * TheAudioDB Source Provider
 * Tier 3 - Community database with good artwork and metadata
 * https://www.theaudiodb.com/
 */

import { rateLimitedFetch, fetchWithTimeout } from '../rateLimit';
import {
  SOURCES,
  type ArtistData,
  type AlbumData,
  type ImageData,
  type ArtistQuery,
  type AlbumQuery,
  type SourcedResult,
} from './types';

// Free demo API key
const API_KEY = '2';
const BASE_URL = `https://www.theaudiodb.com/api/v1/json/${API_KEY}`;

interface TADBSearchResult {
  artists?: TADBArtist[];
  album?: TADBAlbum[];
}

interface TADBArtist {
  idArtist: string;
  strArtist: string;
  strArtistAlternate?: string;
  strLabel?: string;
  idLabel?: string;
  intFormedYear?: string;
  intBornYear?: string;
  intDiedYear?: string;
  strDisbanded?: string;
  strStyle?: string;
  strGenre?: string;
  strMood?: string;
  strWebsite?: string;
  strFacebook?: string;
  strTwitter?: string;
  strBiographyEN?: string;
  strBiographyDE?: string;
  strBiographyFR?: string;
  strCountry?: string;
  strArtistThumb?: string;
  strArtistLogo?: string;
  strArtistCutout?: string;
  strArtistClearart?: string;
  strArtistWideThumb?: string;
  strArtistFanart?: string;
  strArtistFanart2?: string;
  strArtistFanart3?: string;
  strArtistBanner?: string;
}

interface TADBAlbum {
  idAlbum: string;
  idArtist: string;
  strAlbum: string;
  strArtist: string;
  intYearReleased?: string;
  strStyle?: string;
  strGenre?: string;
  strLabel?: string;
  strReleaseFormat?: string;
  intSales?: string;
  strAlbumThumb?: string;
  strAlbumThumbHQ?: string;
  strAlbumThumbBack?: string;
  strAlbumCDart?: string;
  strAlbumSpine?: string;
  strAlbum3DCase?: string;
  strAlbum3DFlat?: string;
  strAlbum3DFace?: string;
  strAlbum3DThumb?: string;
  strDescriptionEN?: string;
  strDescriptionDE?: string;
  strDescriptionFR?: string;
  intScore?: string;
  intScoreVotes?: string;
  strReview?: string;
  strMood?: string;
  strTheme?: string;
  strSpeed?: string;
}

async function tadbFetch<T>(endpoint: string): Promise<T | null> {
  return rateLimitedFetch('theaudiodb', async () => {
    const response = await fetchWithTimeout(`${BASE_URL}${endpoint}`, {
      timeout: 10000,
    });

    if (!response.ok) {
      throw new Error(`TheAudioDB API error: ${response.status}`);
    }
    return response.json();
  });
}

/**
 * Create bio summary from full bio
 */
function createBioSummary(bio: string): string {
  const sentences = bio.split(/(?<=[.!?])\s+/);
  return sentences.slice(0, 3).join(' ');
}

/**
 * Fetch artist data from TheAudioDB
 */
export async function fetchArtistData(
  query: ArtistQuery,
  signal?: AbortSignal
): Promise<SourcedResult<ArtistData> | null> {
  try {
    const result = await tadbFetch<TADBSearchResult>(
      `/search.php?s=${encodeURIComponent(query.name)}`
    );

    const artist = result?.artists?.[0];
    if (!artist) return null;

    const bio = artist.strBiographyEN || artist.strBiographyDE || artist.strBiographyFR;
    const genres = [artist.strGenre, artist.strStyle, artist.strMood]
      .filter(Boolean) as string[];

    const links: { type: string; url: string }[] = [];
    if (artist.strWebsite) links.push({ type: 'website', url: `https://${artist.strWebsite}` });
    if (artist.strFacebook) links.push({ type: 'facebook', url: artist.strFacebook });
    if (artist.strTwitter) links.push({ type: 'twitter', url: artist.strTwitter });

    const data: ArtistData = {
      bio,
      bioSummary: bio ? createBioSummary(bio) : undefined,
      origin: artist.strCountry,
      formed: artist.intFormedYear || artist.intBornYear,
      disbanded: artist.strDisbanded,
      genres,
      links,
    };

    return {
      data,
      source: SOURCES.THEAUDIODB,
      fetchedAt: Date.now(),
    };
  } catch (error) {
    console.error('[TheAudioDB] Artist fetch error:', error);
    return null;
  }
}

/**
 * Fetch album data from TheAudioDB
 */
export async function fetchAlbumData(
  query: AlbumQuery,
  signal?: AbortSignal
): Promise<SourcedResult<AlbumData> | null> {
  try {
    const result = await tadbFetch<TADBSearchResult>(
      `/searchalbum.php?s=${encodeURIComponent(query.artist)}&a=${encodeURIComponent(query.title)}`
    );

    const album = result?.album?.[0];
    if (!album) return null;

    const description =
      album.strDescriptionEN || album.strDescriptionDE || album.strDescriptionFR;
    const genres = [album.strGenre, album.strStyle, album.strMood]
      .filter(Boolean) as string[];

    const data: AlbumData = {
      description,
      descriptionSummary: description ? createBioSummary(description) : undefined,
      genres,
      releaseDate: album.intYearReleased,
      releaseType: album.strReleaseFormat || 'Album',
      label: album.strLabel,
      rating: album.intScore ? parseFloat(album.intScore) / 10 : undefined,
      ratingCount: album.intScoreVotes ? parseInt(album.intScoreVotes) : undefined,
    };

    return {
      data,
      source: SOURCES.THEAUDIODB,
      fetchedAt: Date.now(),
    };
  } catch (error) {
    console.error('[TheAudioDB] Album fetch error:', error);
    return null;
  }
}

/**
 * Fetch artist image from TheAudioDB
 */
export async function fetchArtistImage(
  query: ArtistQuery,
  signal?: AbortSignal
): Promise<SourcedResult<ImageData> | null> {
  try {
    const result = await tadbFetch<TADBSearchResult>(
      `/search.php?s=${encodeURIComponent(query.name)}`
    );

    const artist = result?.artists?.[0];
    if (!artist) return null;

    // Priority: thumb > fanart > cutout > logo
    const imageUrl =
      artist.strArtistThumb ||
      artist.strArtistFanart ||
      artist.strArtistFanart2 ||
      artist.strArtistFanart3 ||
      artist.strArtistCutout ||
      artist.strArtistLogo;

    if (!imageUrl) return null;

    return {
      data: {
        url: imageUrl,
        type: artist.strArtistThumb ? 'thumb' : 'fanart',
      },
      source: SOURCES.THEAUDIODB,
      fetchedAt: Date.now(),
    };
  } catch (error) {
    console.error('[TheAudioDB] Image fetch error:', error);
    return null;
  }
}

/**
 * Fetch album cover from TheAudioDB
 */
export async function fetchAlbumCover(
  query: AlbumQuery,
  signal?: AbortSignal
): Promise<SourcedResult<ImageData> | null> {
  try {
    const result = await tadbFetch<TADBSearchResult>(
      `/searchalbum.php?s=${encodeURIComponent(query.artist)}&a=${encodeURIComponent(query.title)}`
    );

    const album = result?.album?.[0];
    if (!album) return null;

    // Prefer HQ thumb
    const imageUrl = album.strAlbumThumbHQ || album.strAlbumThumb;
    if (!imageUrl) return null;

    return {
      data: {
        url: imageUrl,
        type: 'cover',
      },
      source: SOURCES.THEAUDIODB,
      fetchedAt: Date.now(),
    };
  } catch (error) {
    console.error('[TheAudioDB] Cover fetch error:', error);
    return null;
  }
}

/**
 * Fetch artist background specifically
 */
export async function fetchArtistBackground(
  query: ArtistQuery,
  signal?: AbortSignal
): Promise<SourcedResult<ImageData> | null> {
  try {
    const result = await tadbFetch<TADBSearchResult>(
      `/search.php?s=${encodeURIComponent(query.name)}`
    );

    const artist = result?.artists?.[0];
    if (!artist) return null;

    const imageUrl =
      artist.strArtistFanart ||
      artist.strArtistFanart2 ||
      artist.strArtistFanart3 ||
      artist.strArtistWideThumb;

    if (!imageUrl) return null;

    return {
      data: {
        url: imageUrl,
        type: 'fanart',
      },
      source: SOURCES.THEAUDIODB,
      fetchedAt: Date.now(),
    };
  } catch (error) {
    console.error('[TheAudioDB] Background fetch error:', error);
    return null;
  }
}
