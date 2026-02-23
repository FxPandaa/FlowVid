/**
 * FlowVid API - Profile Routes
 * CRUD operations for user profiles (up to 8 per account)
 *
 * Profiles let household members share one subscription while keeping
 * separate libraries, watch history, collections and preferences.
 */

import { Router, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "../database/index.js";
import { authenticate } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import {
  BadRequestError,
  NotFoundError,
  ForbiddenError,
} from "../utils/errors.js";
import { getSubscriptionStatus } from "../services/billing/service.js";
import { SubscriptionStatus } from "../services/billing/types.js";

const router = Router();
const MAX_PROFILES = 8;

// All routes require authentication
router.use(authenticate);

// =============================================================================
// LIST PROFILES
// =============================================================================

/**
 * GET /profiles
 * Get all profiles for the authenticated user
 */
router.get(
  "/",
  asyncHandler(async (req: Request, res: Response) => {
    const db = getDb();

    const profiles = db
      .prepare(
        `SELECT * FROM profiles WHERE user_id = ? ORDER BY created_at ASC`,
      )
      .all(req.userId) as any[];

    res.json({
      success: true,
      profiles: profiles.map((p) => ({
        id: p.id,
        name: p.name,
        avatarColor: p.avatar_color,
        avatarIcon: p.avatar_icon,
        isKid: !!p.is_kid,
        createdAt: p.created_at,
      })),
    });
  }),
);

// =============================================================================
// CREATE PROFILE
// =============================================================================

/**
 * POST /profiles
 * Create a new profile (max 8 per account)
 */
router.post(
  "/",
  asyncHandler(async (req: Request, res: Response) => {
    const { name, avatarColor, avatarIcon, isKid } = req.body as {
      name?: string;
      avatarColor?: string;
      avatarIcon?: string;
      isKid?: boolean;
    };
    const db = getDb();

    if (!name || !name.trim()) {
      throw new BadRequestError("Profile name is required");
    }

    // Profiles are a FlowVid+ feature — check subscription
    const subStatus = getSubscriptionStatus(req.userId!);
    if (subStatus.status !== SubscriptionStatus.ACTIVE) {
      throw new ForbiddenError(
        "Profiles require an active FlowVid+ subscription",
      );
    }

    // Check profile count
    const count = db
      .prepare(`SELECT COUNT(*) as cnt FROM profiles WHERE user_id = ?`)
      .get(req.userId) as { cnt: number };

    if (count.cnt >= MAX_PROFILES) {
      throw new BadRequestError(
        `Maximum of ${MAX_PROFILES} profiles per account`,
      );
    }

    const id = uuidv4();
    db.prepare(
      `INSERT INTO profiles (id, user_id, name, avatar_color, avatar_icon, is_kid)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      req.userId,
      name.trim(),
      avatarColor || "#00E5FF",
      avatarIcon || "😊",
      isKid ? 1 : 0,
    );

    res.status(201).json({
      success: true,
      profile: {
        id,
        name: name.trim(),
        avatarColor: avatarColor || "#00E5FF",
        avatarIcon: avatarIcon || "😊",
        isKid: !!isKid,
        createdAt: new Date().toISOString(),
      },
    });
  }),
);

// =============================================================================
// UPDATE PROFILE
// =============================================================================

/**
 * PATCH /profiles/:profileId
 * Update a profile's name, avatar, or kid flag
 */
router.patch(
  "/:profileId",
  asyncHandler(async (req: Request, res: Response) => {
    const { profileId } = req.params;
    const { name, avatarColor, avatarIcon, isKid } = req.body as {
      name?: string;
      avatarColor?: string;
      avatarIcon?: string;
      isKid?: boolean;
    };
    const db = getDb();

    // Verify ownership
    const profile = db
      .prepare(`SELECT * FROM profiles WHERE id = ? AND user_id = ?`)
      .get(profileId, req.userId) as any;

    if (!profile) {
      throw new NotFoundError("Profile not found");
    }

    const updates: string[] = [];
    const params: (string | number)[] = [];

    if (name !== undefined) {
      if (!name.trim()) throw new BadRequestError("Name cannot be empty");
      updates.push("name = ?");
      params.push(name.trim());
    }
    if (avatarColor !== undefined) {
      updates.push("avatar_color = ?");
      params.push(avatarColor);
    }
    if (avatarIcon !== undefined) {
      updates.push("avatar_icon = ?");
      params.push(avatarIcon);
    }
    if (isKid !== undefined) {
      updates.push("is_kid = ?");
      params.push(isKid ? 1 : 0);
    }

    if (updates.length === 0) {
      throw new BadRequestError("No updates provided");
    }

    params.push(profileId as string);
    db.prepare(`UPDATE profiles SET ${updates.join(", ")} WHERE id = ?`).run(
      ...params,
    );

    res.json({ success: true, message: "Profile updated" });
  }),
);

// =============================================================================
// DELETE PROFILE
// =============================================================================

/**
 * DELETE /profiles/:profileId
 * Delete a profile and all its associated data (library, history, collections)
 */
router.delete(
  "/:profileId",
  asyncHandler(async (req: Request, res: Response) => {
    const { profileId } = req.params;
    const db = getDb();

    // Verify ownership
    const profile = db
      .prepare(`SELECT * FROM profiles WHERE id = ? AND user_id = ?`)
      .get(profileId, req.userId) as any;

    if (!profile) {
      throw new NotFoundError("Profile not found");
    }

    // Delete profile (cascade will clean up library, history, collections, settings with profile_id)
    // Also manually clean up rows that reference this profile_id
    db.transaction(() => {
      db.prepare(`DELETE FROM library WHERE profile_id = ?`).run(profileId);
      db.prepare(`DELETE FROM watch_history WHERE profile_id = ?`).run(
        profileId,
      );
      db.prepare(`DELETE FROM collections WHERE profile_id = ?`).run(profileId);
      db.prepare(`DELETE FROM user_settings WHERE profile_id = ?`).run(
        profileId,
      );
      db.prepare(`DELETE FROM profiles WHERE id = ?`).run(profileId);
    })();

    res.json({ success: true, message: "Profile deleted" });
  }),
);

// =============================================================================
// BULK SYNC PROFILES (push all profiles from client)
// =============================================================================

/**
 * POST /profiles/sync
 * Sync all profiles from client to server (client wins)
 */
router.post(
  "/sync",
  asyncHandler(async (req: Request, res: Response) => {
    const { profiles } = req.body as { profiles: any[] };
    const db = getDb();

    if (!Array.isArray(profiles)) {
      throw new BadRequestError("Invalid profiles data");
    }

    if (profiles.length > MAX_PROFILES) {
      throw new BadRequestError(
        `Maximum of ${MAX_PROFILES} profiles per account`,
      );
    }

    db.transaction(() => {
      // Get existing profile IDs
      const existing = db
        .prepare(`SELECT id FROM profiles WHERE user_id = ?`)
        .all(req.userId) as { id: string }[];
      const existingIds = new Set(existing.map((p) => p.id));
      const clientIds = new Set(profiles.map((p) => p.id));

      // Delete profiles not in client set
      for (const id of existingIds) {
        if (!clientIds.has(id)) {
          db.prepare(`DELETE FROM library WHERE profile_id = ?`).run(id);
          db.prepare(`DELETE FROM watch_history WHERE profile_id = ?`).run(id);
          db.prepare(`DELETE FROM collections WHERE profile_id = ?`).run(id);
          db.prepare(`DELETE FROM user_settings WHERE profile_id = ?`).run(id);
          db.prepare(`DELETE FROM profiles WHERE id = ?`).run(id);
        }
      }

      // Upsert profiles
      const upsertStmt = db.prepare(`
        INSERT INTO profiles (id, user_id, name, avatar_color, avatar_icon, is_kid, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          avatar_color = excluded.avatar_color,
          avatar_icon = excluded.avatar_icon,
          is_kid = excluded.is_kid
      `);

      for (const p of profiles) {
        upsertStmt.run(
          p.id,
          req.userId,
          p.name,
          p.avatarColor || "#00E5FF",
          p.avatarIcon || "😊",
          p.isKid ? 1 : 0,
          p.createdAt || new Date().toISOString(),
        );
      }
    })();

    res.json({
      success: true,
      message: "Profiles synced",
      count: profiles.length,
    });
  }),
);

export default router;
