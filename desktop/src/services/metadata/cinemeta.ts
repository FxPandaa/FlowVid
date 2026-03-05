// Cinemeta API service - Stremio's metadata addon
const CINEMETA_BASE_URL = "https://v3-cinemeta.strem.io";

// Raw Cinemeta response types
interface CinemetaRawMeta {
  id: string; // IMDB ID
  type: "movie" | "series";
  name: string;
  year?: number;
  releaseInfo?: string;
  description?: string;
  poster?: string;
  background?: string;
  logo?: string;
  runtime?: string;
  genres?: string[];
  director?: string[];
  cast?: string[];
  imdbRating?: string;
  popularity?: number;
  slug?: string;
  videos?: CinemetaRawEpisode[];
  writer?: string[];
  awards?: string;
  country?: string;
  language?: string;
}

interface CinemetaRawEpisode {
  id: string;
  title?: string;
  name?: string;
  season: number;
  episode: number;
  released?: string;
  overview?: string;
  thumbnail?: string;
}

// Normalized types for app consumption (compatible with existing components)
export interface MediaItem {
  id: string; // IMDB ID
  imdbId: string; // Same as id, for compatibility
  type: "movie" | "series";
  name: string;
  title: string; // Alias for name (for component compatibility)
  year?: number;
  releaseInfo?: string;
  description?: string;
  overview?: string; // Alias for description
  poster?: string;
  background?: string;
  backdrop?: string; // Alias for background
  logo?: string;
  runtime?: string;
  genres?: string[];
  director?: string[];
  cast?: string[];
  imdbRating?: string;
  rating: number; // Parsed imdbRating as number
  popularity?: number;
  slug?: string;
}

export interface MovieDetails extends MediaItem {
  type: "movie";
  writer?: string[];
  awards?: string;
  country?: string;
  language?: string;
}

export interface SeriesDetails extends MediaItem {
  type: "series";
  videos?: Episode[];
  seasons?: { seasonNumber: number; id: string }[];
  numberOfSeasons?: number;
}

export interface Episode {
  id: string;
  title: string;
  name: string; // Alias for title
  season: number;
  episode: number;
  episodeNumber: number; // Alias for episode
  released?: string;
  overview?: string;
  thumbnail?: string;
  still?: string; // Alias for thumbnail
}

interface CatalogResponse {
  metas: CinemetaRawMeta[];
}

// Normalize raw cinemeta data to our MediaItem format
function normalizeMediaItem(raw: CinemetaRawMeta): MediaItem {
  // Parse year from releaseInfo (e.g. "2019", "2019-2023", "2019-") when year is missing
  let year = raw.year;
  if (!year && raw.releaseInfo) {
    const match = raw.releaseInfo.match(/^(\d{4})/);
    if (match) year = parseInt(match[1], 10);
  }

  return {
    ...raw,
    year,
    imdbId: raw.id,
    title: raw.name,
    overview: raw.description,
    backdrop: raw.background,
    rating: raw.imdbRating ? parseFloat(raw.imdbRating) : 0,
  };
}

function normalizeMovieDetails(raw: CinemetaRawMeta): MovieDetails {
  return {
    ...normalizeMediaItem(raw),
    type: "movie",
    writer: raw.writer,
    awards: raw.awards,
    country: raw.country,
    language: raw.language,
  };
}

function normalizeSeriesDetails(raw: CinemetaRawMeta): SeriesDetails {
  const videos = raw.videos?.map(normalizeEpisode) || [];
  const seasonNumbers = [
    ...new Set(videos.map((v) => v.season).filter((s) => s > 0)),
  ].sort((a, b) => a - b);

  return {
    ...normalizeMediaItem(raw),
    type: "series",
    videos,
    seasons: seasonNumbers.map((num) => ({
      seasonNumber: num,
      id: `${raw.id}:${num}`,
    })),
    numberOfSeasons: seasonNumbers.length,
  };
}

function normalizeEpisode(raw: CinemetaRawEpisode): Episode {
  // Cinemeta API sometimes uses 'name' and sometimes 'title' for episode names
  const episodeName = raw.name || raw.title || `Episode ${raw.episode}`;
  return {
    ...raw,
    title: episodeName,
    name: episodeName,
    episodeNumber: raw.episode,
    still: raw.thumbnail,
  };
}

class CinemetaService {
  /**
   * In-memory response cache.  Keyed by the endpoint path, stores the
   * already-normalised result together with a timestamp so we can serve
   * stale-while-revalidate for a smooth UX.
   */
  private cache = new Map<string, { data: unknown; ts: number }>();
  private static CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  private getCached<T>(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    // Still fresh
    if (Date.now() - entry.ts < CinemetaService.CACHE_TTL) {
      return entry.data as T;
    }
    // Stale – return it anyway (caller can refresh in background)
    return entry.data as T;
  }

  private setCache(key: string, data: unknown): void {
    this.cache.set(key, { data, ts: Date.now() });
  }

  private async request<T>(endpoint: string): Promise<T> {
    const url = `${CINEMETA_BASE_URL}${endpoint}`;

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Cinemeta API error: ${response.status}`);
    }

    return response.json();
  }

  // Get movie or series details by IMDB ID
  async getDetails(
    type: "movie" | "series",
    imdbId: string,
  ): Promise<MovieDetails | SeriesDetails> {
    const data = await this.request<{ meta: CinemetaRawMeta }>(
      `/meta/${type}/${imdbId}.json`,
    );

    if (type === "movie") {
      return normalizeMovieDetails(data.meta);
    }
    return normalizeSeriesDetails(data.meta);
  }

  // Get movie details
  async getMovieDetails(imdbId: string): Promise<MovieDetails> {
    return this.getDetails("movie", imdbId) as Promise<MovieDetails>;
  }

  // Get series details with episodes
  async getSeriesDetails(imdbId: string): Promise<SeriesDetails> {
    return this.getDetails("series", imdbId) as Promise<SeriesDetails>;
  }

  // Get catalog (popular/top) — cached
  async getCatalog(
    type: "movie" | "series",
    catalog: "top" | "year" | "imdbRating" = "top",
    skip: number = 0,
  ): Promise<MediaItem[]> {
    const cacheKey = `catalog:${type}:${catalog}:${skip}`;
    const cached = this.getCached<MediaItem[]>(cacheKey);
    if (cached) return cached;

    try {
      const data = await this.request<CatalogResponse>(
        `/catalog/${type}/${catalog}/skip=${skip}.json`,
      );
      const items = (data.metas || []).map((meta) =>
        normalizeMediaItem({ ...meta, type }),
      );
      this.setCache(cacheKey, items);
      return items;
    } catch {
      return [];
    }
  }

  // Get popular movies
  async getPopularMovies(skip: number = 0): Promise<MediaItem[]> {
    return this.getCatalog("movie", "top", skip);
  }

  // Get popular series
  async getPopularSeries(skip: number = 0): Promise<MediaItem[]> {
    return this.getCatalog("series", "top", skip);
  }

  // Get top rated movies
  async getTopRatedMovies(skip: number = 0): Promise<MediaItem[]> {
    return this.getCatalog("movie", "imdbRating", skip);
  }

  // Get top rated series
  async getTopRatedSeries(skip: number = 0): Promise<MediaItem[]> {
    return this.getCatalog("series", "imdbRating", skip);
  }

  // Search movies and series
  async search(
    query: string,
    type?: "movie" | "series",
  ): Promise<{ results: MediaItem[] }> {
    const searchTypes = type ? [type] : (["movie", "series"] as const);
    const results: MediaItem[] = [];

    for (const t of searchTypes) {
      try {
        const data = await this.request<CatalogResponse>(
          `/catalog/${t}/top/search=${encodeURIComponent(query)}.json`,
        );
        if (data.metas) {
          results.push(
            ...data.metas.map((meta) =>
              normalizeMediaItem({ ...meta, type: t }),
            ),
          );
        }
      } catch {
        // Search might fail for some types, continue
      }
    }

    return { results };
  }

  // Get episodes for a series season
  async getSeasonEpisodes(
    imdbId: string,
    seasonNumber: number,
  ): Promise<Episode[]> {
    const series = await this.getSeriesDetails(imdbId);
    if (!series.videos) return [];

    return series.videos
      .filter((video) => video.season === seasonNumber)
      .sort((a, b) => a.episodeNumber - b.episodeNumber);
  }

  // Get all seasons from series
  getSeasons(seriesDetails: SeriesDetails): number[] {
    if (!seriesDetails.videos) return [];

    const seasons = new Set(
      seriesDetails.videos.map((v) => v.season).filter((s) => s > 0),
    );

    return Array.from(seasons).sort((a, b) => a - b);
  }

  // Find by IMDB ID (returns basic info)
  async findByImdbId(imdbId: string): Promise<MediaItem | null> {
    // Try movie first
    try {
      const movie = await this.getMovieDetails(imdbId);
      if (movie) return movie;
    } catch {
      // Not a movie, try series
    }

    try {
      const series = await this.getSeriesDetails(imdbId);
      if (series) return series;
    } catch {
      // Not found
    }

    return null;
  }
}

export const cinemetaService = new CinemetaService();
