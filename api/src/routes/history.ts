/**
 * FlowVid API - Watch History Routes
 * Track viewing progress across all platforms
 */

import { Router, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "../database/index.js";
import { authenticate } from "../middleware/auth.js";
import { asyncHandler, validateBody } from "../middleware/errorHandler.js";
import { updateHistorySchema } from "../utils/validation.js";
import {
  getMetadata,
  getCachedMetadataBatch,
} from "../services/metadata/index.js";
import { MediaType } from "../types/index.js";
import type { WatchHistoryEntry } from "../types/index.js";

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /history
 * Get user's watch history (Continue Watching)
 */
router.get(
  "/",
  asyncHandler(async (req: Request, res: Response) => {
    const db = getDb();
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = (page - 1) * limit;

    // Get history items, excluding completed (>95% watched)
    const items = db
      .prepare(
        `
      SELECT * FROM watch_history 
      WHERE user_id = ?
        AND (progress_seconds * 1.0 / duration_seconds) < 0.95
      ORDER BY last_watched_at DESC
      LIMIT ? OFFSET ?
    `,
      )
      .all(req.userId, limit, offset) as WatchHistoryEntry[];

    // Get total count
    const countResult = db
      .prepare(
        `
      SELECT COUNT(*) as count FROM watch_history 
      WHERE user_id = ?
        AND (progress_seconds * 1.0 / duration_seconds) < 0.95
    `,
      )
      .get(req.userId) as { count: number };

    // Batch-fetch metadata from cache in one query (eliminates N+1 HTTP calls)
    const imdbIds = items.map((item) => item.imdb_id);
    const cachedMeta = getCachedMetadataBatch(imdbIds);

    // Calculate progress percentage and enrich with metadata
    const itemsWithMetadata = await Promise.all(
      items.map(async (item) => {
        const progressPercent =
          item.duration_seconds > 0
            ? Math.round((item.progress_seconds / item.duration_seconds) * 100)
            : 0;

        const cached = cachedMeta.get(item.imdb_id);
        if (cached) return { ...item, progressPercent, metadata: cached };

        try {
          const mediaType = item.season ? MediaType.SERIES : MediaType.MOVIE;
          const metadata = await getMetadata(item.imdb_id, mediaType);
          return { ...item, progressPercent, metadata };
        } catch {
          return { ...item, progressPercent, metadata: null };
        }
      }),
    );

    res.json({
      success: true,
      data: itemsWithMetadata,
      pagination: {
        page,
        limit,
        total: countResult.count,
        hasMore: offset + items.length < countResult.count,
      },
    });
  }),
);

/**
 * GET /history/all
 * Get full watch history (including completed)
 */
router.get(
  "/all",
  asyncHandler(async (req: Request, res: Response) => {
    const db = getDb();
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = (page - 1) * limit;

    const items = db
      .prepare(
        `
      SELECT * FROM watch_history 
      WHERE user_id = ?
      ORDER BY last_watched_at DESC
      LIMIT ? OFFSET ?
    `,
      )
      .all(req.userId, limit, offset) as WatchHistoryEntry[];

    const countResult = db
      .prepare(
        `
      SELECT COUNT(*) as count FROM watch_history WHERE user_id = ?
    `,
      )
      .get(req.userId) as { count: number };

    const itemsWithProgress = items.map((item) => ({
      ...item,
      progressPercent:
        item.duration_seconds > 0
          ? Math.round((item.progress_seconds / item.duration_seconds) * 100)
          : 0,
    }));

    res.json({
      success: true,
      data: itemsWithProgress,
      pagination: {
        page,
        limit,
        total: countResult.count,
        hasMore: offset + items.length < countResult.count,
      },
    });
  }),
);

/**
 * POST /history
 * Update watch progress
 * Called periodically during playback (e.g., every 30 seconds)
 */
router.post(
  "/",
  validateBody(updateHistorySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { imdbId, season, episode, progressSeconds, durationSeconds } =
      req.body as {
        imdbId: string;
        season?: number;
        episode?: number;
        progressSeconds: number;
        durationSeconds: number;
      };
    const db = getDb();

    // Atomic upsert — INSERT or UPDATE on conflict (no race condition)
    db.prepare(
      `
      INSERT INTO watch_history
        (id, user_id, imdb_id, season, episode, progress_seconds, duration_seconds)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, imdb_id, season, episode) DO UPDATE SET
        progress_seconds = excluded.progress_seconds,
        duration_seconds = excluded.duration_seconds,
        last_watched_at = datetime('now')
    `,
    ).run(
      uuidv4(),
      req.userId,
      imdbId,
      season ?? null,
      episode ?? null,
      progressSeconds,
      durationSeconds,
    );

    res.json({
      success: true,
      data: {
        imdbId,
        season,
        episode,
        progressSeconds,
        durationSeconds,
        progressPercent: Math.round((progressSeconds / durationSeconds) * 100),
      },
    });
  }),
);

/**
 * GET /history/:imdbId
 * Get watch progress for specific content
 */
router.get(
  "/:imdbId",
  asyncHandler(async (req: Request, res: Response) => {
    const imdbId = req.params.imdbId as string;
    const { season, episode } = req.query;
    const db = getDb();

    let query = `
      SELECT * FROM watch_history 
      WHERE user_id = ? AND imdb_id = ?
    `;
    const params: (string | number | null)[] = [req.userId!, imdbId];

    if (season !== undefined && episode !== undefined) {
      query += " AND season = ? AND episode = ?";
      params.push(parseInt(season as string), parseInt(episode as string));
    }

    query += " ORDER BY last_watched_at DESC";

    const items = db.prepare(query).all(...params) as WatchHistoryEntry[];

    const itemsWithProgress = items.map((item) => ({
      ...item,
      progressPercent:
        item.duration_seconds > 0
          ? Math.round((item.progress_seconds / item.duration_seconds) * 100)
          : 0,
    }));

    res.json({
      success: true,
      data: itemsWithProgress,
    });
  }),
);

/**
 * DELETE /history/:imdbId
 * Delete watch history for content
 */
router.delete(
  "/:imdbId",
  asyncHandler(async (req: Request, res: Response) => {
    const imdbId = req.params.imdbId as string;
    const { season, episode } = req.query;
    const db = getDb();

    let query = "DELETE FROM watch_history WHERE user_id = ? AND imdb_id = ?";
    const params: (string | number | null)[] = [req.userId!, imdbId];

    if (season !== undefined && episode !== undefined) {
      query += " AND season = ? AND episode = ?";
      params.push(parseInt(season as string), parseInt(episode as string));
    }

    db.prepare(query).run(...params);

    res.json({
      success: true,
      message: "Watch history deleted",
    });
  }),
);

/**
 * DELETE /history
 * Clear all watch history
 */
router.delete(
  "/",
  asyncHandler(async (req: Request, res: Response) => {
    const db = getDb();

    const result = db
      .prepare(
        `
      DELETE FROM watch_history WHERE user_id = ?
    `,
      )
      .run(req.userId);

    res.json({
      success: true,
      message: `Cleared ${result.changes} history entries`,
    });
  }),
);

export default router;
