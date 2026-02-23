/**
 * FlowVid API - User Routes
 * Handles user profile and preferences (synced across devices)
 */

import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import { getDb } from "../database/index.js";
import { authenticate } from "../middleware/auth.js";
import { asyncHandler, validateBody } from "../middleware/errorHandler.js";
import {
  updateProfileSchema,
  updatePreferencesSchema,
} from "../utils/validation.js";
import {
  NotFoundError,
  UnauthorizedError,
  BadRequestError,
} from "../utils/errors.js";
import type {
  User,
  UserPreferences,
  QualityPreference,
} from "../types/index.js";

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /user/profile
 * Get current user profile
 */
router.get(
  "/profile",
  asyncHandler(async (req: Request, res: Response) => {
    const db = getDb();

    const user = db
      .prepare(`SELECT id, email, created_at FROM users WHERE id = ?`)
      .get(req.userId) as Pick<User, "id" | "email" | "created_at"> | undefined;

    if (!user) {
      throw new NotFoundError("User not found");
    }

    res.json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        createdAt: user.created_at,
      },
    });
  }),
);

/**
 * PATCH /user/profile
 * Update user profile (email, password)
 */
router.patch(
  "/profile",
  validateBody(updateProfileSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { email, currentPassword, newPassword } = req.body as {
      email?: string;
      currentPassword?: string;
      newPassword?: string;
    };
    const db = getDb();

    const user = db
      .prepare("SELECT * FROM users WHERE id = ?")
      .get(req.userId) as User | undefined;
    if (!user) {
      throw new NotFoundError("User not found");
    }

    const updates: string[] = [];
    const params: (string | number)[] = [];

    // Update email
    if (email && email.toLowerCase() !== user.email) {
      const existing = db
        .prepare("SELECT id FROM users WHERE email = ? AND id != ?")
        .get(email.toLowerCase(), req.userId);
      if (existing) {
        throw new BadRequestError("Email already in use");
      }
      updates.push("email = ?");
      params.push(email.toLowerCase());
    }

    // Update password
    if (newPassword) {
      if (!currentPassword) {
        throw new BadRequestError("Current password is required");
      }

      const isValid = await bcrypt.compare(currentPassword, user.password_hash);
      if (!isValid) {
        throw new UnauthorizedError("Current password is incorrect");
      }

      const newHash = await bcrypt.hash(newPassword, 12);
      updates.push("password_hash = ?");
      params.push(newHash);
    }

    if (updates.length === 0) {
      throw new BadRequestError("No updates provided");
    }

    updates.push("updated_at = datetime('now')");
    params.push(req.userId!);

    db.prepare(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`).run(
      ...params,
    );

    res.json({
      success: true,
      message: "Profile updated successfully",
    });
  }),
);

/**
 * GET /user/preferences
 * Get user preferences (synced across all devices)
 */
router.get(
  "/preferences",
  asyncHandler(async (req: Request, res: Response) => {
    const db = getDb();

    const prefs = db
      .prepare(`SELECT * FROM user_preferences WHERE user_id = ?`)
      .get(req.userId) as UserPreferences | undefined;

    if (!prefs) {
      // Create default preferences
      db.prepare("INSERT INTO user_preferences (user_id) VALUES (?)").run(
        req.userId,
      );

      res.json({
        success: true,
        data: {
          preferredQuality: "auto",
          subtitleLanguage: null,
          audioLanguage: null,
          autoplayNextEpisode: true,
        },
      });
      return;
    }

    res.json({
      success: true,
      data: {
        preferredQuality: prefs.preferred_quality,
        subtitleLanguage: prefs.subtitle_language,
        audioLanguage: prefs.audio_language,
        autoplayNextEpisode: Boolean(prefs.autoplay_next_episode),
      },
    });
  }),
);

/**
 * PATCH /user/preferences
 * Update user preferences
 */
router.patch(
  "/preferences",
  validateBody(updatePreferencesSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const {
      preferredQuality,
      subtitleLanguage,
      audioLanguage,
      autoplayNextEpisode,
    } = req.body as {
      preferredQuality?: QualityPreference;
      subtitleLanguage?: string | null;
      audioLanguage?: string | null;
      autoplayNextEpisode?: boolean;
    };
    const db = getDb();

    // Ensure preferences row exists
    db.prepare(
      `INSERT OR IGNORE INTO user_preferences (user_id) VALUES (?)`,
    ).run(req.userId);

    const updates: string[] = [];
    const params: (string | number | null)[] = [];

    if (preferredQuality !== undefined) {
      updates.push("preferred_quality = ?");
      params.push(preferredQuality);
    }

    if (subtitleLanguage !== undefined) {
      updates.push("subtitle_language = ?");
      params.push(subtitleLanguage);
    }

    if (audioLanguage !== undefined) {
      updates.push("audio_language = ?");
      params.push(audioLanguage);
    }

    if (autoplayNextEpisode !== undefined) {
      updates.push("autoplay_next_episode = ?");
      params.push(autoplayNextEpisode ? 1 : 0);
    }

    if (updates.length === 0) {
      throw new BadRequestError("No updates provided");
    }

    params.push(req.userId!);

    db.prepare(
      `UPDATE user_preferences SET ${updates.join(", ")} WHERE user_id = ?`,
    ).run(...params);

    res.json({
      success: true,
      message: "Preferences updated successfully",
    });
  }),
);

/**
 * DELETE /user/account
 * Delete user account
 */
router.delete(
  "/account",
  asyncHandler(async (req: Request, res: Response) => {
    const db = getDb();

    // Delete user and all related data (cascades via foreign keys)
    db.prepare("DELETE FROM users WHERE id = ?").run(req.userId);

    res.json({
      success: true,
      message: "Account deleted successfully",
    });
  }),
);

export default router;
