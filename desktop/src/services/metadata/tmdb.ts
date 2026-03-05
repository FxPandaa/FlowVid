/**
 * TMDB (The Movie Database) service — comprehensive metadata enrichment.
 *
 * Provides: cast with photos, crew, trailers, production companies,
 * networks, certification, recommendations, person details, episode ratings,
 * budget/revenue, status, origin country, and more.
 *
 * Free tier: requires an API key (v3 auth), ~40 req/10s rate limit.
 * https://developer.themoviedb.org/docs/getting-started
 */

const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";

// Built-in default API key (v3, free/public). Users can override in Settings.
const TMDB_DEFAULT_KEY = "d131017ccc6e5462a81c9304d21476de";

/** Returns the active TMDB API key: custom key from settings if set, else built-in default. */
function getApiKey(): string {
  try {
    const raw = localStorage.getItem("FlowVid-settings");
    if (raw) {
      const parsed = JSON.parse(raw);
      const state = parsed?.state;
      if (state?.tmdbUseCustomKey && state?.tmdbCustomApiKey) {
        return state.tmdbCustomApiKey;
      }
    }
  } catch {
    // fall through
  }
  return import.meta.env.VITE_TMDB_API_KEY || TMDB_DEFAULT_KEY;
}

// ── Public types ────────────────────────────────────────────────────────

export interface TmdbCastMember {
  id: number;
  name: string;
  character: string;
  profilePhoto: string | null;
  order: number;
}

export interface TmdbCrewMember {
  id: number;
  name: string;
  job: string;
  department: string;
  profilePhoto: string | null;
}

export interface TmdbTrailer {
  id: string;
  key: string;
  name: string;
  type: string;
  official: boolean;
  site: string;
}

export interface TmdbProductionCompany {
  id: number;
  name: string;
  logoUrl: string | null;
  originCountry: string;
}

export interface TmdbNetwork {
  id: number;
  name: string;
  logoUrl: string | null;
  originCountry: string;
}

export interface TmdbRecommendation {
  id: number;
  imdbId?: string;
  title: string;
  posterUrl: string | null;
  backdropUrl: string | null;
  rating: number;
  releaseDate: string;
  type: "movie" | "series";
  overview: string;
}

export interface TmdbPersonDetails {
  id: number;
  name: string;
  biography: string;
  birthday: string | null;
  deathday: string | null;
  placeOfBirth: string | null;
  profilePhoto: string | null;
  profilePhotoLarge: string | null;
  knownForDepartment: string;
  alsoKnownAs: string[];
  gender: number; // 0=unknown, 1=female, 2=male, 3=non-binary
  popularity: number;
  combinedCredits: TmdbPersonCredit[];
}

export interface TmdbPersonCredit {
  id: number;
  title: string;
  character?: string;
  job?: string;
  posterUrl: string | null;
  releaseDate: string;
  type: "movie" | "series";
  rating: number;
  episodeCount?: number;
}

export interface TmdbEpisodeRating {
  season: number;
  episode: number;
  name: string;
  rating: number;
  voteCount: number;
  airDate: string | null;
  still: string | null;
  overview: string;
  runtime: number | null;
}

export interface TmdbDiscoverItem {
  tmdbId: number;
  title: string;
  posterUrl: string | null;
  backdropUrl: string | null;
  rating: number;
  releaseDate: string;
  type: "movie" | "series";
  overview: string;
  genreIds: number[];
}

export interface TmdbEnrichedData {
  tmdbId: number;
  cast: TmdbCastMember[];
  crew: TmdbCrewMember[];
  trailers: TmdbTrailer[];
  certification: string | null;
  tagline: string | null;
  productionCompanies: TmdbProductionCompany[];
  networks: TmdbNetwork[];
  recommendations: TmdbRecommendation[];
  budget: number | null;
  revenue: number | null;
  status: string | null;
  originCountry: string[];
  originalLanguage: string | null;
  firstAirDate: string | null;
  lastAirDate: string | null;
  numberOfSeasons: number | null;
  numberOfEpisodes: number | null;
  runtime: number | null;
  voteAverage: number | null;
  voteCount: number | null;
}

// ── Raw TMDB response shapes ────────────────────────────────────────────

interface TmdbFindResult {
  movie_results: { id: number; vote_average?: number }[];
  tv_results: { id: number; vote_average?: number }[];
}

interface TmdbCreditRaw {
  id: number;
  name: string;
  character?: string;
  profile_path: string | null;
  order?: number;
  job?: string;
  department?: string;
  known_for_department?: string;
}

interface TmdbVideoRaw {
  id: string;
  key: string;
  name: string;
  type: string;
  official: boolean;
  site: string;
  size: number;
  published_at?: string;
}

interface TmdbCompanyRaw {
  id: number;
  name: string;
  logo_path: string | null;
  origin_country: string;
}

interface TmdbNetworkRaw {
  id: number;
  name: string;
  logo_path: string | null;
  origin_country: string;
}

interface TmdbRecommendationRaw {
  id: number;
  title?: string;
  name?: string;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
  release_date?: string;
  first_air_date?: string;
  media_type: string;
  overview: string;
}

interface TmdbMovieAppended {
  id: number;
  tagline?: string;
  budget?: number;
  revenue?: number;
  runtime?: number;
  status?: string;
  origin_country?: string[];
  original_language?: string;
  vote_average?: number;
  vote_count?: number;
  production_companies?: TmdbCompanyRaw[];
  credits: { cast: TmdbCreditRaw[]; crew: TmdbCreditRaw[] };
  videos: { results: TmdbVideoRaw[] };
  recommendations?: { results: TmdbRecommendationRaw[] };
  release_dates?: {
    results: {
      iso_3166_1: string;
      release_dates: { certification: string; type: number }[];
    }[];
  };
}

interface TmdbTvAppended {
  id: number;
  tagline?: string;
  status?: string;
  origin_country?: string[];
  original_language?: string;
  first_air_date?: string;
  last_air_date?: string;
  number_of_seasons?: number;
  number_of_episodes?: number;
  episode_run_time?: number[];
  vote_average?: number;
  vote_count?: number;
  production_companies?: TmdbCompanyRaw[];
  networks?: TmdbNetworkRaw[];
  credits: { cast: TmdbCreditRaw[]; crew: TmdbCreditRaw[] };
  videos: { results: TmdbVideoRaw[] };
  recommendations?: { results: TmdbRecommendationRaw[] };
  content_ratings?: {
    results: { iso_3166_1: string; rating: string }[];
  };
}

interface TmdbPersonRaw {
  id: number;
  name: string;
  biography: string;
  birthday: string | null;
  deathday: string | null;
  place_of_birth: string | null;
  profile_path: string | null;
  known_for_department: string;
  also_known_as: string[];
  gender: number;
  popularity: number;
}

interface TmdbPersonCreditRaw {
  id: number;
  title?: string;
  name?: string;
  character?: string;
  job?: string;
  poster_path: string | null;
  release_date?: string;
  first_air_date?: string;
  media_type: string;
  vote_average: number;
  episode_count?: number;
}

interface TmdbSeasonDetailRaw {
  episodes: {
    episode_number: number;
    season_number: number;
    name: string;
    vote_average: number;
    vote_count: number;
    air_date: string | null;
    still_path: string | null;
    overview: string;
    runtime: number | null;
  }[];
}

interface TmdbDiscoverRaw {
  id: number;
  title?: string;
  name?: string;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
  release_date?: string;
  first_air_date?: string;
  overview: string;
  genre_ids: number[];
}

interface TmdbExternalIds {
  imdb_id?: string;
}

// ── Service ─────────────────────────────────────────────────────────────

class TmdbService {
  private cache = new Map<string, { data: unknown; ts: number }>();
  private static CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
  private inflight = new Map<string, Promise<unknown>>();

  get isAvailable(): boolean {
    return getApiKey().length > 0;
  }

  // ── Main enrichment ─────────────────────────────────────────────────

  async getEnrichedData(
    imdbId: string,
    type: "movie" | "series",
  ): Promise<TmdbEnrichedData | null> {
    if (!this.isAvailable) return null;
    return this.cached(`enrich:${imdbId}`, () =>
      this.fetchEnrichedData(imdbId, type),
    );
  }

  // ── Person details ──────────────────────────────────────────────────

  async getPersonDetails(personId: number): Promise<TmdbPersonDetails | null> {
    if (!this.isAvailable) return null;
    return this.cached(`person:${personId}`, () =>
      this.fetchPersonDetails(personId),
    );
  }

  // ── Episode ratings for a season ────────────────────────────────────

  async getSeasonRatings(
    imdbId: string,
    type: "movie" | "series",
    seasonNumber: number,
  ): Promise<TmdbEpisodeRating[]> {
    if (!this.isAvailable || type !== "series") return [];
    const result = await this.cached(
      `season:${imdbId}:${seasonNumber}`,
      () => this.fetchSeasonRatings(imdbId, seasonNumber),
    );
    return result || [];
  }

  // ── Recommendation IMDb ID resolution ───────────────────────────────

  async resolveImdbId(
    tmdbId: number,
    type: "movie" | "series",
  ): Promise<string | null> {
    try {
      const endpoint =
        type === "movie"
          ? `/movie/${tmdbId}/external_ids`
          : `/tv/${tmdbId}/external_ids`;
      const result = await this.request<TmdbExternalIds>(endpoint);
      return result?.imdb_id || null;
    } catch {
      return null;
    }
  }

  // ── Rating lookup by IMDB ID (for search enrichment) ────────────────

  async getRatingByImdbId(
    imdbId: string,
    type: "movie" | "series",
  ): Promise<number> {
    if (!this.isAvailable) return 0;

    const cacheKey = `rating:${imdbId}`;
    const entry = this.cache.get(cacheKey);
    if (entry && Date.now() - entry.ts < TmdbService.CACHE_TTL) {
      return entry.data as number;
    }

    try {
      const res = await this.request<TmdbFindResult>(
        `/find/${imdbId}?external_source=imdb_id`,
      );

      let rating = 0;
      if (type === "movie" && res.movie_results.length > 0) {
        rating = Math.round((res.movie_results[0].vote_average || 0) * 10) / 10;
      } else if (type === "series" && res.tv_results.length > 0) {
        rating = Math.round((res.tv_results[0].vote_average || 0) * 10) / 10;
      }

      this.cache.set(cacheKey, { data: rating, ts: Date.now() });
      return rating;
    } catch {
      return 0;
    }
  }

  /**
   * Batch-enrich an array of items that are missing ratings.
   * Fires lookups in parallel (max 10 at a time) and mutates the rating field.
   */
  async enrichRatings<T extends { id: string; type: "movie" | "series"; rating: number }>(
    items: T[],
  ): Promise<T[]> {
    if (!this.isAvailable) return items;

    const needRating = items.filter((i) => !i.rating || i.rating === 0);
    if (needRating.length === 0) return items;

    // Fire all lookups in parallel (TMDB find endpoint is lightweight)
    const lookups = needRating.map(async (item) => {
      const rating = await this.getRatingByImdbId(item.id, item.type);
      if (rating > 0) item.rating = rating;
    });

    await Promise.allSettled(lookups);
    return items;
  }

  // ── Generic cache helper ────────────────────────────────────────────

  private async cached<T>(
    key: string,
    fetcher: () => Promise<T | null>,
  ): Promise<T | null> {
    const entry = this.cache.get(key);
    if (entry && Date.now() - entry.ts < TmdbService.CACHE_TTL) {
      return entry.data as T;
    }

    const existing = this.inflight.get(key);
    if (existing) return existing as Promise<T | null>;

    const promise = fetcher()
      .then((result) => {
        if (result !== null) {
          this.cache.set(key, { data: result, ts: Date.now() });
        }
        this.inflight.delete(key);
        return result;
      })
      .catch((err) => {
        this.inflight.delete(key);
        console.warn(`[TMDB] ${key}:`, err);
        return null;
      });

    this.inflight.set(key, promise);
    return promise;
  }

  // ── Fetchers ────────────────────────────────────────────────────────

  private async fetchEnrichedData(
    imdbId: string,
    type: "movie" | "series",
  ): Promise<TmdbEnrichedData | null> {
    const tmdbId = await this.findTmdbId(imdbId, type);
    if (!tmdbId) return null;

    const raw =
      type === "movie"
        ? await this.request<TmdbMovieAppended>(
            `/movie/${tmdbId}?append_to_response=credits,videos,release_dates,recommendations`,
          )
        : await this.request<TmdbTvAppended>(
            `/tv/${tmdbId}?append_to_response=credits,videos,content_ratings,recommendations`,
          );

    if (!raw) return null;
    return this.normalizeEnriched(raw, type);
  }

  private async fetchPersonDetails(
    personId: number,
  ): Promise<TmdbPersonDetails | null> {
    const raw = await this.request<
      TmdbPersonRaw & {
        combined_credits: {
          cast: TmdbPersonCreditRaw[];
          crew: TmdbPersonCreditRaw[];
        };
      }
    >(`/person/${personId}?append_to_response=combined_credits`);

    if (!raw) return null;

    const castCredits = (raw.combined_credits?.cast || [])
      .filter((c) => c.vote_average > 0)
      .sort((a, b) => b.vote_average - a.vote_average)
      .slice(0, 30)
      .map((c) => this.normalizePersonCredit(c));

    const crewCredits = (raw.combined_credits?.crew || [])
      .filter((c) => c.vote_average > 0)
      .sort((a, b) => b.vote_average - a.vote_average)
      .slice(0, 10)
      .map((c) => this.normalizePersonCredit(c));

    return {
      id: raw.id,
      name: raw.name,
      biography: raw.biography || "",
      birthday: raw.birthday,
      deathday: raw.deathday,
      placeOfBirth: raw.place_of_birth,
      profilePhoto: raw.profile_path
        ? `${TMDB_IMAGE_BASE}/w300${raw.profile_path}`
        : null,
      profilePhotoLarge: raw.profile_path
        ? `${TMDB_IMAGE_BASE}/w500${raw.profile_path}`
        : null,
      knownForDepartment: raw.known_for_department || "Acting",
      alsoKnownAs: raw.also_known_as || [],
      gender: raw.gender,
      popularity: raw.popularity,
      combinedCredits: [...castCredits, ...crewCredits],
    };
  }

  private async fetchSeasonRatings(
    imdbId: string,
    seasonNumber: number,
  ): Promise<TmdbEpisodeRating[]> {
    const tmdbId = await this.findTmdbId(imdbId, "series");
    if (!tmdbId) return [];

    const raw = await this.request<TmdbSeasonDetailRaw>(
      `/tv/${tmdbId}/season/${seasonNumber}`,
    );
    if (!raw?.episodes) return [];

    return raw.episodes.map((ep) => ({
      season: ep.season_number,
      episode: ep.episode_number,
      name: ep.name,
      rating: Math.round(ep.vote_average * 10) / 10,
      voteCount: ep.vote_count,
      airDate: ep.air_date,
      still: ep.still_path
        ? `${TMDB_IMAGE_BASE}/w300${ep.still_path}`
        : null,
      overview: ep.overview || "",
      runtime: ep.runtime,
    }));
  }

  private async findTmdbId(
    imdbId: string,
    type: "movie" | "series",
  ): Promise<number | null> {
    const cacheKey = `find:${imdbId}:${type}`;
    const entry = this.cache.get(cacheKey);
    if (entry && Date.now() - entry.ts < TmdbService.CACHE_TTL) {
      return entry.data as number | null;
    }

    const res = await this.request<TmdbFindResult>(
      `/find/${imdbId}?external_source=imdb_id`,
    );

    let id: number | null = null;
    if (type === "movie" && res.movie_results.length > 0) {
      id = res.movie_results[0].id;
    } else if (type === "series" && res.tv_results.length > 0) {
      id = res.tv_results[0].id;
    }

    this.cache.set(cacheKey, { data: id, ts: Date.now() });
    return id;
  }

  // ── Normalizers ─────────────────────────────────────────────────────

  private normalizeEnriched(
    raw: TmdbMovieAppended | TmdbTvAppended,
    type: "movie" | "series",
  ): TmdbEnrichedData {
    // Cast — top 20
    const cast: TmdbCastMember[] = (raw.credits?.cast || [])
      .slice(0, 20)
      .map((c) => ({
        id: c.id,
        name: c.name,
        character: c.character || "",
        profilePhoto: c.profile_path
          ? `${TMDB_IMAGE_BASE}/w185${c.profile_path}`
          : null,
        order: c.order ?? 999,
      }));

    // Key crew
    const importantJobs = new Set([
      "Director",
      "Writer",
      "Screenplay",
      "Creator",
      "Original Music Composer",
      "Director of Photography",
      "Producer",
      "Executive Producer",
    ]);
    const crew: TmdbCrewMember[] = (raw.credits?.crew || [])
      .filter((c) => importantJobs.has(c.job || ""))
      .slice(0, 10)
      .map((c) => ({
        id: c.id,
        name: c.name,
        job: c.job || "",
        department: c.department || c.known_for_department || "",
        profilePhoto: c.profile_path
          ? `${TMDB_IMAGE_BASE}/w185${c.profile_path}`
          : null,
      }));

    // Trailers — only official trailers, no teasers/clips/featurettes
    const trailers: TmdbTrailer[] = (raw.videos?.results || [])
      .filter(
        (v) =>
          v.site === "YouTube" && v.type === "Trailer" && v.official === true,
      )
      .sort((a, b) => {
        // Sort newest first via published_at if available, else keep TMDB order
        const da = a.published_at ? new Date(a.published_at).getTime() : 0;
        const db = b.published_at ? new Date(b.published_at).getTime() : 0;
        return db - da;
      })
      .slice(0, 6)
      .map((v) => ({
        id: v.id,
        key: v.key,
        name: v.name,
        type: v.type,
        official: v.official,
        site: v.site,
      }));

    // Production companies
    const productionCompanies: TmdbProductionCompany[] = (
      raw.production_companies || []
    ).map((c) => ({
      id: c.id,
      name: c.name,
      logoUrl: c.logo_path
        ? `${TMDB_IMAGE_BASE}/w200${c.logo_path}`
        : null,
      originCountry: c.origin_country || "",
    }));

    // Networks (TV only)
    const networks: TmdbNetwork[] =
      "networks" in raw
        ? (raw.networks || []).map((n: TmdbNetworkRaw) => ({
            id: n.id,
            name: n.name,
            logoUrl: n.logo_path
              ? `${TMDB_IMAGE_BASE}/w200${n.logo_path}`
              : null,
            originCountry: n.origin_country || "",
          }))
        : [];

    // Recommendations
    const recommendations: TmdbRecommendation[] = (
      raw.recommendations?.results || []
    )
      .slice(0, 12)
      .map((r) => ({
        id: r.id,
        title: r.title || r.name || "",
        posterUrl: r.poster_path
          ? `${TMDB_IMAGE_BASE}/w342${r.poster_path}`
          : null,
        backdropUrl: r.backdrop_path
          ? `${TMDB_IMAGE_BASE}/w780${r.backdrop_path}`
          : null,
        rating: Math.round(r.vote_average * 10) / 10,
        releaseDate: r.release_date || r.first_air_date || "",
        type: r.media_type === "tv" ? "series" as const : "movie" as const,
        overview: r.overview || "",
      }));

    // Certification
    let certification: string | null = null;
    if (type === "movie" && "release_dates" in raw) {
      const us = (raw as TmdbMovieAppended).release_dates?.results?.find(
        (r) => r.iso_3166_1 === "US",
      );
      const cert = us?.release_dates?.find((rd) => rd.certification);
      certification = cert?.certification || null;
    } else if (type === "series" && "content_ratings" in raw) {
      const us = (raw as TmdbTvAppended).content_ratings?.results?.find(
        (r) => r.iso_3166_1 === "US",
      );
      certification = us?.rating || null;
    }

    const isMovie = type === "movie";
    const movieRaw = raw as TmdbMovieAppended;
    const tvRaw = raw as TmdbTvAppended;

    return {
      tmdbId: raw.id,
      cast,
      crew,
      trailers,
      certification,
      tagline: raw.tagline || null,
      productionCompanies,
      networks,
      recommendations,
      budget: isMovie && movieRaw.budget ? movieRaw.budget : null,
      revenue: isMovie && movieRaw.revenue ? movieRaw.revenue : null,
      status: raw.status || null,
      originCountry:
        (isMovie ? movieRaw.origin_country : tvRaw.origin_country) || [],
      originalLanguage: raw.original_language || null,
      firstAirDate: !isMovie ? tvRaw.first_air_date || null : null,
      lastAirDate: !isMovie ? tvRaw.last_air_date || null : null,
      numberOfSeasons: !isMovie ? tvRaw.number_of_seasons || null : null,
      numberOfEpisodes: !isMovie ? tvRaw.number_of_episodes || null : null,
      runtime: isMovie
        ? movieRaw.runtime || null
        : tvRaw.episode_run_time?.[0] || null,
      voteAverage: raw.vote_average ?? null,
      voteCount: raw.vote_count ?? null,
    };
  }

  private normalizePersonCredit(c: TmdbPersonCreditRaw): TmdbPersonCredit {
    return {
      id: c.id,
      title: c.title || c.name || "",
      character: c.character,
      job: c.job,
      posterUrl: c.poster_path
        ? `${TMDB_IMAGE_BASE}/w185${c.poster_path}`
        : null,
      releaseDate: c.release_date || c.first_air_date || "",
      type: c.media_type === "tv" ? "series" : "movie",
      rating: Math.round(c.vote_average * 10) / 10,
      episodeCount: c.episode_count,
    };
  }

  /** Validate any TMDB API key by hitting /configuration */
  async validateApiKey(key: string): Promise<boolean> {
    try {
      const res = await fetch(`${TMDB_BASE}/configuration?api_key=${key}`);
      return res.ok;
    } catch {
      return false;
    }
  }

  // ── Genre list ──────────────────────────────────────────────────────

  async getGenres(
    type: "movie" | "series",
  ): Promise<{ id: number; name: string }[]> {
    const endpoint =
      type === "movie" ? "/genre/movie/list" : "/genre/tv/list";
    return this.cached(`genres:${type}`, async () => {
      const res = await this.request<{
        genres: { id: number; name: string }[];
      }>(endpoint);
      return res.genres || [];
    }).then((r) => r || []);
  }

  // ── Discover ────────────────────────────────────────────────────────

  async discover(
    type: "movie" | "series",
    params: {
      page?: number;
      sortBy?: string;
      genres?: number[];
      yearGte?: number;
      yearLte?: number;
      ratingGte?: number;
      ratingLte?: number;
      language?: string;
    } = {},
  ): Promise<{ results: TmdbDiscoverItem[]; totalPages: number }> {
    if (!this.isAvailable)
      return { results: [], totalPages: 0 };

    const endpoint = type === "movie" ? "/discover/movie" : "/discover/tv";

    // TMDB uses different sort param names for movies vs TV
    let sortParam = params.sortBy || "popularity.desc";
    if (type !== "movie") {
      if (sortParam.startsWith("primary_release_date")) {
        sortParam = sortParam.replace("primary_release_date", "first_air_date");
      } else if (sortParam.startsWith("revenue")) {
        sortParam = "popularity.desc";
      }
    }

    const qp = new URLSearchParams();
    qp.set("sort_by", sortParam);
    qp.set("page", String(params.page || 1));
    qp.set("include_adult", "false");
    qp.set("vote_count.gte", "50");

    if (params.genres && params.genres.length > 0) {
      qp.set("with_genres", params.genres.join(","));
    }
    if (params.ratingGte !== undefined) {
      qp.set("vote_average.gte", String(params.ratingGte));
    }
    if (params.ratingLte !== undefined) {
      qp.set("vote_average.lte", String(params.ratingLte));
    }
    if (params.language) {
      qp.set("with_original_language", params.language);
    }

    if (type === "movie") {
      if (params.yearGte) qp.set("primary_release_date.gte", `${params.yearGte}-01-01`);
      if (params.yearLte) qp.set("primary_release_date.lte", `${params.yearLte}-12-31`);
    } else {
      if (params.yearGte) qp.set("first_air_date.gte", `${params.yearGte}-01-01`);
      if (params.yearLte) qp.set("first_air_date.lte", `${params.yearLte}-12-31`);
    }

    const res = await this.request<{
      results: TmdbDiscoverRaw[];
      total_pages: number;
    }>(`${endpoint}?${qp.toString()}`);

    const results: TmdbDiscoverItem[] = (res.results || []).map((r) => ({
      tmdbId: r.id,
      title: r.title || r.name || "",
      posterUrl: r.poster_path
        ? `${TMDB_IMAGE_BASE}/w342${r.poster_path}`
        : null,
      backdropUrl: r.backdrop_path
        ? `${TMDB_IMAGE_BASE}/w780${r.backdrop_path}`
        : null,
      rating: Math.round(r.vote_average * 10) / 10,
      releaseDate: r.release_date || r.first_air_date || "",
      type,
      overview: r.overview || "",
      genreIds: r.genre_ids || [],
    }));

    return { results, totalPages: res.total_pages || 0 };
  }

  // ── Trending ────────────────────────────────────────────────────────

  async getTrending(
    type: "movie" | "series",
    timeWindow: "day" | "week" = "week",
  ): Promise<TmdbDiscoverItem[]> {
    if (!this.isAvailable) return [];
    const mediaType = type === "movie" ? "movie" : "tv";
    const res = await this.request<{
      results: TmdbDiscoverRaw[];
    }>(`/trending/${mediaType}/${timeWindow}`);

    return (res.results || []).map((r) => ({
      tmdbId: r.id,
      title: r.title || r.name || "",
      posterUrl: r.poster_path
        ? `${TMDB_IMAGE_BASE}/w342${r.poster_path}`
        : null,
      backdropUrl: r.backdrop_path
        ? `${TMDB_IMAGE_BASE}/w780${r.backdrop_path}`
        : null,
      rating: Math.round(r.vote_average * 10) / 10,
      releaseDate: r.release_date || r.first_air_date || "",
      type,
      overview: r.overview || "",
      genreIds: r.genre_ids || [],
    }));
  }

  // ── For You — recommendation by genres ──────────────────────────────

  async getRecommendationsByGenres(
    type: "movie" | "series",
    genreIds: number[],
    _excludeIds?: Set<string>,
    page: number = 1,
  ): Promise<TmdbDiscoverItem[]> {
    if (!this.isAvailable || genreIds.length === 0) return [];

    const result = await this.discover(type, {
      genres: genreIds.slice(0, 3),
      sortBy: "vote_average.desc",
      ratingGte: 7,
      page,
    });

    return result.results;
  }

  /** Clear the in-memory cache */
  clearCache(): void {
    this.cache.clear();
    this.inflight.clear();
  }

  // ── HTTP ────────────────────────────────────────────────────────────

  private async request<T>(endpoint: string): Promise<T> {
    const separator = endpoint.includes("?") ? "&" : "?";
    const url = `${TMDB_BASE}${endpoint}${separator}api_key=${getApiKey()}`;

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`TMDB ${res.status}: ${res.statusText}`);
    }
    return res.json();
  }
}

export const tmdbService = new TmdbService();
