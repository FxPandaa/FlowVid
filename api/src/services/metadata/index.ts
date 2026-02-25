/**
 * FlowVid API - Metadata Service (Cinemeta)
 * Provides movie/series information, posters, descriptions, episodes
 */

import axios, { AxiosInstance } from "axios";
import { getDb } from "../../database/index.js";
import config from "../../config/index.js";
import { MediaType } from "../../types/index.js";
import type { CinemetaMetadata, CinemetaEpisode } from "../../types/index.js";
import { NotFoundError, ExternalServiceError } from "../../utils/errors.js";

const client: AxiosInstance = axios.create({
  baseURL: config.cinemeta.baseUrl,
  timeout: 10000,
  headers: {
    Accept: "application/json",
  },
});

/**
 * Get cached metadata from database
 */
function getCachedMetadata(imdbId: string): CinemetaMetadata | null {
  const db = getDb();

  const cached = db
    .prepare(
      `
    SELECT metadata_json FROM metadata_cache
    WHERE imdb_id = ? AND expires_at > datetime('now')
  `,
    )
    .get(imdbId) as { metadata_json: string } | undefined;

  if (!cached) return null;

  try {
    return JSON.parse(cached.metadata_json) as CinemetaMetadata;
  } catch {
    return null;
  }
}

/**
 * Batch-fetch cached metadata for multiple IMDB IDs in a single query.
 * Returns a Map of imdbId → metadata (only cache hits).
 */
export function getCachedMetadataBatch(
  imdbIds: string[],
): Map<string, CinemetaMetadata> {
  const result = new Map<string, CinemetaMetadata>();
  if (imdbIds.length === 0) return result;

  const db = getDb();
  const placeholders = imdbIds.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT imdb_id, metadata_json FROM metadata_cache
       WHERE imdb_id IN (${placeholders}) AND expires_at > datetime('now')`,
    )
    .all(...imdbIds) as { imdb_id: string; metadata_json: string }[];

  for (const row of rows) {
    try {
      result.set(
        row.imdb_id,
        JSON.parse(row.metadata_json) as CinemetaMetadata,
      );
    } catch {
      // skip malformed cache entries
    }
  }

  return result;
}

/**
 * Cache metadata in database
 */
function cacheMetadata(
  imdbId: string,
  mediaType: MediaType,
  metadata: CinemetaMetadata,
): void {
  const db = getDb();
  const expiresAt = new Date(
    Date.now() + config.cache.metadataTtl * 1000,
  ).toISOString();

  db.prepare(
    `
    INSERT OR REPLACE INTO metadata_cache 
      (imdb_id, media_type, metadata_json, cached_at, expires_at)
    VALUES (?, ?, ?, datetime('now'), ?)
  `,
  ).run(imdbId, mediaType, JSON.stringify(metadata), expiresAt);
}

/**
 * Get metadata for a movie or series
 */
export async function getMetadata(
  imdbId: string,
  mediaType: MediaType,
): Promise<CinemetaMetadata> {
  // Check cache first
  const cached = getCachedMetadata(imdbId);
  if (cached) {
    return cached;
  }

  try {
    const response = await client.get(`/meta/${mediaType}/${imdbId}.json`);

    if (!response.data?.meta) {
      throw new NotFoundError(`Content not found: ${imdbId}`);
    }

    const meta = response.data.meta;

    const metadata: CinemetaMetadata = {
      id: meta.id || imdbId,
      imdb_id: imdbId,
      type: mediaType,
      name: meta.name,
      slug: meta.slug,
      poster: meta.poster,
      background: meta.background,
      logo: meta.logo,
      description: meta.description,
      releaseInfo: meta.releaseInfo,
      year: meta.year,
      runtime: meta.runtime,
      genres: meta.genres,
      director: meta.director,
      cast: meta.cast,
      writer: meta.writer,
      imdbRating: meta.imdbRating,
      awards: meta.awards,
      country: meta.country,
      language: meta.language,
      videos: meta.videos?.map(
        (v: {
          id: string;
          name?: string;
          title?: string;
          season: number;
          episode: number;
          overview?: string;
          thumbnail?: string;
          released?: string;
        }) => ({
          id: v.id,
          name: v.name || v.title,
          season: v.season,
          episode: v.episode,
          overview: v.overview,
          thumbnail: v.thumbnail,
          released: v.released,
        }),
      ),
    };

    // Cache the result
    cacheMetadata(imdbId, mediaType, metadata);

    return metadata;
  } catch (error) {
    if (error instanceof NotFoundError) throw error;

    if (axios.isAxiosError(error)) {
      if (error.response?.status === 404) {
        throw new NotFoundError(`Content not found: ${imdbId}`);
      }
      throw new ExternalServiceError("Cinemeta service error");
    }

    throw new ExternalServiceError("Failed to fetch metadata");
  }
}

/**
 * Search for content by query
 */
export async function searchContent(
  query: string,
  type?: MediaType,
): Promise<CinemetaMetadata[]> {
  const results: CinemetaMetadata[] = [];

  try {
    // Search movies
    if (!type || type === MediaType.MOVIE) {
      const movieResponse = await client.get(
        `/catalog/movie/top/search=${encodeURIComponent(query)}.json`,
      );
      if (movieResponse.data?.metas) {
        for (const meta of movieResponse.data.metas.slice(0, 20)) {
          results.push({
            id: meta.id,
            imdb_id: meta.imdb_id || meta.id,
            type: MediaType.MOVIE,
            name: meta.name,
            poster: meta.poster,
            description: meta.description,
            year: meta.year,
            imdbRating: meta.imdbRating,
          });
        }
      }
    }

    // Search series
    if (!type || type === MediaType.SERIES) {
      const seriesResponse = await client.get(
        `/catalog/series/top/search=${encodeURIComponent(query)}.json`,
      );
      if (seriesResponse.data?.metas) {
        for (const meta of seriesResponse.data.metas.slice(0, 20)) {
          results.push({
            id: meta.id,
            imdb_id: meta.imdb_id || meta.id,
            type: MediaType.SERIES,
            name: meta.name,
            poster: meta.poster,
            description: meta.description,
            year: meta.year,
            imdbRating: meta.imdbRating,
          });
        }
      }
    }

    return results;
  } catch (error) {
    console.error("[Metadata] Search error:", error);
    throw new ExternalServiceError("Failed to search content");
  }
}

/**
 * Get popular/trending content
 */
export async function getPopular(
  mediaType: MediaType,
  genre?: string,
  limit: number = 20,
): Promise<CinemetaMetadata[]> {
  try {
    let endpoint = `/catalog/${mediaType}/top.json`;

    if (genre) {
      endpoint = `/catalog/${mediaType}/top/genre=${encodeURIComponent(genre)}.json`;
    }

    const response = await client.get(endpoint);

    if (!response.data?.metas) {
      return [];
    }

    return response.data.metas
      .slice(0, limit)
      .map(
        (meta: {
          id: string;
          imdb_id?: string;
          name: string;
          poster?: string;
          description?: string;
          year?: number;
          imdbRating?: string;
        }) => ({
          id: meta.id,
          imdb_id: meta.imdb_id || meta.id,
          type: mediaType,
          name: meta.name,
          poster: meta.poster,
          description: meta.description,
          year: meta.year,
          imdbRating: meta.imdbRating,
        }),
      );
  } catch (error) {
    console.error("[Metadata] Popular fetch error:", error);
    throw new ExternalServiceError("Failed to fetch popular content");
  }
}

/**
 * Get episodes for a series
 */
export async function getSeriesEpisodes(
  imdbId: string,
  season?: number,
): Promise<CinemetaMetadata> {
  const metadata = await getMetadata(imdbId, MediaType.SERIES);

  // Filter by season if specified
  if (season !== undefined && metadata.videos) {
    metadata.videos = metadata.videos.filter(
      (v: CinemetaEpisode) => v.season === season,
    );
  }

  return metadata;
}

/**
 * Clear expired metadata cache
 */
export function clearExpiredMetadataCache(): void {
  const db = getDb();

  const result = db
    .prepare(
      `
    DELETE FROM metadata_cache WHERE expires_at < datetime('now')
  `,
    )
    .run();

  console.log(`[Metadata] Cleared ${result.changes} expired cache entries`);
}

export default {
  getMetadata,
  getCachedMetadataBatch,
  searchContent,
  getPopular,
  getSeriesEpisodes,
  clearExpiredMetadataCache,
};
