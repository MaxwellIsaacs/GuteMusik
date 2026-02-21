/**
 * Wikidata Source Provider
 * Tier 3 - Structured knowledge base
 * https://www.wikidata.org/wiki/Wikidata:Data_access
 */

import { fetchWithTimeout } from '../rateLimit';
import {
  SOURCES,
  type ArtistData,
  type AlbumData,
  type ArtistQuery,
  type AlbumQuery,
  type SourcedResult,
} from './types';

const SPARQL_ENDPOINT = 'https://query.wikidata.org/sparql';

interface WikidataBinding {
  value: string;
  type: string;
}

interface WikidataSparqlResult {
  results: {
    bindings: Record<string, WikidataBinding>[];
  };
}

/**
 * Execute a SPARQL query against Wikidata
 */
async function sparqlQuery(query: string): Promise<WikidataSparqlResult> {
  const response = await fetchWithTimeout(
    `${SPARQL_ENDPOINT}?query=${encodeURIComponent(query)}&format=json`,
    {
      timeout: 15000,
      headers: {
        'Accept': 'application/sparql-results+json',
        'User-Agent': 'Lumina/1.0 (music-player-app)',
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Wikidata query failed: ${response.status}`);
  }

  return response.json();
}

/**
 * Fetch artist data from Wikidata
 */
export async function fetchArtistData(
  query: ArtistQuery,
  signal?: AbortSignal
): Promise<SourcedResult<ArtistData> | null> {
  try {
    // SPARQL query to find artist by name
    const sparql = `
      SELECT ?item ?itemLabel ?description ?inception ?origin ?originLabel ?dissolved ?genreLabel ?memberLabel
      WHERE {
        ?item rdfs:label "${query.name.replace(/"/g, '\\"')}"@en.
        ?item wdt:P31/wdt:P279* wd:Q215380.  # musical group or subclass
        OPTIONAL { ?item schema:description ?description. FILTER(LANG(?description) = "en") }
        OPTIONAL { ?item wdt:P571 ?inception. }
        OPTIONAL { ?item wdt:P576 ?dissolved. }
        OPTIONAL { ?item wdt:P740 ?origin. }
        OPTIONAL { ?item wdt:P136 ?genre. }
        OPTIONAL { ?item wdt:P527 ?member. }
        SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
      }
      LIMIT 20
    `;

    const result = await sparqlQuery(sparql);
    const bindings = result.results.bindings;

    if (!bindings.length) {
      // Try searching for solo artists too
      const soloSparql = `
        SELECT ?item ?itemLabel ?description ?birthDate ?origin ?originLabel ?genreLabel
        WHERE {
          ?item rdfs:label "${query.name.replace(/"/g, '\\"')}"@en.
          ?item wdt:P31 wd:Q5.  # human
          ?item wdt:P106/wdt:P279* wd:Q639669.  # musician
          OPTIONAL { ?item schema:description ?description. FILTER(LANG(?description) = "en") }
          OPTIONAL { ?item wdt:P569 ?birthDate. }
          OPTIONAL { ?item wdt:P19 ?origin. }
          OPTIONAL { ?item wdt:P136 ?genre. }
          SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
        }
        LIMIT 10
      `;

      const soloResult = await sparqlQuery(soloSparql);
      if (!soloResult.results.bindings.length) return null;

      const first = soloResult.results.bindings[0];
      const genres = [
        ...new Set(
          soloResult.results.bindings
            .map(b => b.genreLabel?.value)
            .filter(Boolean)
        ),
      ];

      return {
        data: {
          type: 'Person',
          origin: first.originLabel?.value,
          formed: first.birthDate?.value?.split('T')[0],
          genres,
          bio: first.description?.value,
          bioSummary: first.description?.value,
        },
        source: SOURCES.WIKIDATA,
        fetchedAt: Date.now(),
      };
    }

    const first = bindings[0];

    // Collect unique genres and members
    const genres = [...new Set(bindings.map(b => b.genreLabel?.value).filter(Boolean))];
    const members = [...new Set(bindings.map(b => b.memberLabel?.value).filter(Boolean))];

    const data: ArtistData = {
      type: 'Group',
      origin: first.originLabel?.value,
      formed: first.inception?.value?.split('T')[0],
      disbanded: first.dissolved?.value?.split('T')[0],
      genres,
      members: members.map(name => ({ name })),
      bio: first.description?.value,
      bioSummary: first.description?.value,
    };

    return {
      data,
      source: SOURCES.WIKIDATA,
      fetchedAt: Date.now(),
    };
  } catch (error) {
    console.error('[Wikidata] Artist fetch error:', error);
    return null;
  }
}

/**
 * Fetch album data from Wikidata
 */
export async function fetchAlbumData(
  query: AlbumQuery,
  signal?: AbortSignal
): Promise<SourcedResult<AlbumData> | null> {
  try {
    const sparql = `
      SELECT ?item ?itemLabel ?description ?releaseDate ?genreLabel ?labelLabel ?producerLabel
      WHERE {
        ?item rdfs:label "${query.title.replace(/"/g, '\\"')}"@en.
        ?item wdt:P31/wdt:P279* wd:Q482994.  # album
        ?item wdt:P175 ?artist.
        ?artist rdfs:label "${query.artist.replace(/"/g, '\\"')}"@en.
        OPTIONAL { ?item schema:description ?description. FILTER(LANG(?description) = "en") }
        OPTIONAL { ?item wdt:P577 ?releaseDate. }
        OPTIONAL { ?item wdt:P136 ?genre. }
        OPTIONAL { ?item wdt:P264 ?label. }
        OPTIONAL { ?item wdt:P162 ?producer. }
        SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
      }
      LIMIT 10
    `;

    const result = await sparqlQuery(sparql);
    const bindings = result.results.bindings;

    if (!bindings.length) return null;

    const first = bindings[0];
    const genres = [...new Set(bindings.map(b => b.genreLabel?.value).filter(Boolean))];
    const producers = [...new Set(bindings.map(b => b.producerLabel?.value).filter(Boolean))];

    const data: AlbumData = {
      description: first.description?.value,
      descriptionSummary: first.description?.value,
      releaseDate: first.releaseDate?.value?.split('T')[0],
      genres,
      label: first.labelLabel?.value,
      credits: producers.map(name => ({ role: 'Producer', name })),
    };

    return {
      data,
      source: SOURCES.WIKIDATA,
      fetchedAt: Date.now(),
    };
  } catch (error) {
    console.error('[Wikidata] Album fetch error:', error);
    return null;
  }
}
