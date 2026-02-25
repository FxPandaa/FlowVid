/**
 * FlowVid API - Request Validation with Zod
 * Simplified validation schemas for account sync backend
 */

import { z } from "zod";
import { MediaType, QualityPreference } from "../types/index.js";

// ============================================================================
// AUTH VALIDATION SCHEMAS
// ============================================================================

export const registerSchema = z.object({
  email: z.string().email("Invalid email address").max(255),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password too long")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number"),
});

export const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token is required"),
});

// ============================================================================
// USER VALIDATION SCHEMAS
// ============================================================================

export const updateProfileSchema = z
  .object({
    email: z.string().email("Invalid email address").optional(),
    currentPassword: z.string().optional(),
    newPassword: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .max(128)
      .regex(/[A-Z]/)
      .regex(/[a-z]/)
      .regex(/[0-9]/)
      .optional(),
  })
  .refine(
    (data) => {
      if (data.newPassword && !data.currentPassword) {
        return false;
      }
      return true;
    },
    {
      message: "Current password is required to set new password",
      path: ["currentPassword"],
    },
  );

export const updatePreferencesSchema = z.object({
  preferredQuality: z.nativeEnum(QualityPreference).optional(),
  subtitleLanguage: z.string().max(10).nullable().optional(),
  audioLanguage: z.string().max(10).nullable().optional(),
  autoplayNextEpisode: z.boolean().optional(),
});

// ============================================================================
// LIBRARY VALIDATION SCHEMAS
// ============================================================================

export const addToLibrarySchema = z.object({
  imdbId: z
    .string()
    .regex(/^tt\d{7,}$/, "Invalid IMDB ID format (should be like tt1234567)"),
  mediaType: z.nativeEnum(MediaType, {
    errorMap: () => ({ message: "Media type must be movie or series" }),
  }),
});

export const imdbIdParamSchema = z.object({
  imdbId: z.string().regex(/^tt\d{7,}$/, "Invalid IMDB ID format"),
});

// ============================================================================
// HISTORY VALIDATION SCHEMAS
// ============================================================================

export const updateHistorySchema = z
  .object({
    imdbId: z.string().regex(/^tt\d{7,}$/, "Invalid IMDB ID format"),
    season: z.number().int().min(0).max(100).optional(),
    episode: z.number().int().min(0).max(1000).optional(),
    progressSeconds: z.number().int().min(0).max(86400),
    durationSeconds: z.number().int().min(1).max(86400),
  })
  .refine((data) => data.progressSeconds <= data.durationSeconds, {
    message: "Progress cannot exceed duration",
    path: ["progressSeconds"],
  });

// ============================================================================
// SYNC VALIDATION SCHEMAS
// ============================================================================

/** A single library item in a sync payload */
const syncLibraryItemSchema = z.object({
  id: z.string().optional(),
  imdbId: z.string().min(1).max(20),
  type: z.enum(["movie", "series"]),
  title: z.string().max(500).optional(),
  year: z.number().int().min(1900).max(2100).optional().nullable(),
  poster: z.string().url().max(1000).optional().nullable(),
  backdrop: z.string().url().max(1000).optional().nullable(),
  rating: z.number().min(0).max(10).optional().nullable(),
  genres: z.array(z.string().max(50)).max(20).optional().nullable(),
  runtime: z.number().int().min(0).max(9999).optional().nullable(),
  isFavorite: z.boolean().optional(),
  watchlist: z.boolean().optional(),
  userRating: z.number().int().min(1).max(10).optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
  tags: z.array(z.string().max(100)).max(50).optional().nullable(),
  addedAt: z.string().optional(),
});

/** A single watch history item in a sync payload */
const syncHistoryItemSchema = z.object({
  id: z.string().optional(),
  imdbId: z.string().min(1).max(20),
  type: z.enum(["movie", "series"]).optional(),
  title: z.string().max(500).optional().nullable(),
  poster: z.string().max(1000).optional().nullable(),
  season: z.number().int().min(0).max(100).optional().nullable(),
  episode: z.number().int().min(0).max(10000).optional().nullable(),
  episodeTitle: z.string().max(500).optional().nullable(),
  progress: z.number().min(0).max(100).optional(),
  duration: z.number().min(0).optional(),
  currentTime: z.number().min(0).optional().nullable(),
  watchedAt: z.string().optional(),
  subtitleId: z.string().max(500).optional().nullable(),
  subtitleOffset: z.number().optional().nullable(),
  audioTrackId: z.string().max(500).optional().nullable(),
  torrentInfoHash: z.string().max(200).optional().nullable(),
  torrentTitle: z.string().max(1000).optional().nullable(),
  torrentQuality: z.string().max(50).optional().nullable(),
  torrentProvider: z.string().max(100).optional().nullable(),
});

/** A single collection in a sync payload */
const syncCollectionItemSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  items: z.array(z.string().max(20)).max(5000).optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export const syncLibrarySchema = z.object({
  profileId: z.string().optional().nullable(),
  library: z.array(syncLibraryItemSchema).max(5000),
});

export const syncHistorySchema = z.object({
  profileId: z.string().optional().nullable(),
  history: z.array(syncHistoryItemSchema).max(5000),
});

export const syncCollectionsSchema = z.object({
  profileId: z.string().optional().nullable(),
  collections: z.array(syncCollectionItemSchema).max(500),
});

export const syncSettingsSchema = z.object({
  profileId: z.string().optional().nullable(),
  settings: z.record(z.string(), z.unknown()),
});

export const syncAllSchema = z.object({
  profileId: z.string().optional().nullable(),
  library: z.array(syncLibraryItemSchema).max(5000).optional(),
  history: z.array(syncHistoryItemSchema).max(5000).optional(),
  collections: z.array(syncCollectionItemSchema).max(500).optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
});

// ============================================================================
// HELPER TYPES
// ============================================================================

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type UpdatePreferencesInput = z.infer<typeof updatePreferencesSchema>;
export type AddToLibraryInput = z.infer<typeof addToLibrarySchema>;
export type UpdateHistoryInput = z.infer<typeof updateHistorySchema>;
