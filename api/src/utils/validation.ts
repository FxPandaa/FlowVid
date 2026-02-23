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
// HELPER TYPES
// ============================================================================

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type UpdatePreferencesInput = z.infer<typeof updatePreferencesSchema>;
export type AddToLibraryInput = z.infer<typeof addToLibrarySchema>;
export type UpdateHistoryInput = z.infer<typeof updateHistorySchema>;
