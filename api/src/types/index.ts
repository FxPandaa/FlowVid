/**
 * FlowVid API - Type Definitions
 * Simplified types for account sync backend
 *
 * NOTE: Scraping and debrid types are in the desktop/mobile apps
 */

// ============================================================================
// ENUMS
// ============================================================================

export enum MediaType {
  MOVIE = "movie",
  SERIES = "series",
}

export enum QualityPreference {
  AUTO = "auto",
  QUALITY_4K = "4K",
  QUALITY_1080P = "1080p",
  QUALITY_720P = "720p",
  QUALITY_480P = "480p",
}

// ============================================================================
// USER & AUTH TYPES
// ============================================================================

export interface User {
  id: string;
  email: string;
  password_hash: string;
  created_at: string;
  updated_at: string;
}

export interface UserPreferences {
  user_id: string;
  preferred_quality: QualityPreference;
  subtitle_language: string | null;
  audio_language: string | null;
  autoplay_next_episode: boolean;
}

export interface JWTPayload {
  userId: string;
  email: string;
  iat?: number;
  exp?: number;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

// ============================================================================
// LIBRARY TYPES
// ============================================================================

export interface LibraryItem {
  id: string;
  user_id: string;
  imdb_id: string;
  media_type: MediaType;
  added_at: string;
}

export interface WatchHistoryEntry {
  id: string;
  user_id: string;
  imdb_id: string;
  season: number | null;
  episode: number | null;
  progress_seconds: number;
  duration_seconds: number;
  last_watched_at: string;
}

// ============================================================================
// METADATA TYPES (from Cinemeta)
// ============================================================================

export interface CinemetaMetadata {
  id: string;
  imdb_id: string;
  type: MediaType;
  name: string;
  slug?: string;
  poster?: string;
  background?: string;
  logo?: string;
  description?: string;
  releaseInfo?: string;
  year?: number;
  runtime?: string;
  genres?: string[];
  director?: string[];
  cast?: string[];
  writer?: string[];
  imdbRating?: string;
  awards?: string;
  country?: string;
  language?: string;
  trailers?: { source: string; type: string }[];
  videos?: CinemetaEpisode[];
}

export interface CinemetaEpisode {
  id: string;
  title: string;
  season: number;
  episode: number;
  released?: string;
  overview?: string;
  thumbnail?: string;
}

// ============================================================================
// EXPRESS EXTENSIONS
// ============================================================================

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      userEmail?: string;
    }
  }
}

export {};
