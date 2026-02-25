/**
 * FlowVid API - Sync Routes
 * Full cross-device synchronization for library, history, collections, and settings
 *
 * All endpoints accept an optional `profileId` (query param for GET, body for POST).
 * When provided, data is scoped to that profile. When omitted, legacy behaviour
 * (user-level, profile_id IS NULL) is used for backward compatibility.
 */

import { Router, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "../database/index.js";
import { authenticate } from "../middleware/auth.js";
import { asyncHandler, validateBody } from "../middleware/errorHandler.js";
import {
  syncLibrarySchema,
  syncHistorySchema,
  syncCollectionsSchema,
  syncSettingsSchema,
  syncAllSchema,
} from "../utils/validation.js";

const router = Router();

// ---------------------------------------------------------------------------
// Profile-scoping helpers
// ---------------------------------------------------------------------------

function resolveProfileId(req: Request): string | null {
  return (
    (req.query.profileId as string) || (req.body && req.body.profileId) || null
  );
}

function profileWhere(pid: string | null): string {
  return pid ? "AND profile_id = ?" : "AND profile_id IS NULL";
}

function profileParams(pid: string | null): (string | null)[] {
  return pid ? [pid] : [];
}

// All routes require authentication
router.use(authenticate);

// =============================================================================
// LIBRARY SYNC
// =============================================================================

/**
 * GET /sync/library?profileId=xxx
 */
router.get(
  "/library",
  asyncHandler(async (req: Request, res: Response) => {
    const db = getDb();
    const pid = resolveProfileId(req);

    const items = db
      .prepare(
        `SELECT * FROM library WHERE user_id = ? ${profileWhere(pid)} ORDER BY added_at DESC`,
      )
      .all(req.userId, ...profileParams(pid));

    // Transform to match desktop format
    const library = items.map((item: any) => ({
      id: item.id,
      imdbId: item.imdb_id,
      type: item.media_type,
      title: item.title,
      year: item.year,
      poster: item.poster,
      backdrop: item.backdrop,
      rating: item.rating,
      genres: item.genres_json ? JSON.parse(item.genres_json) : [],
      runtime: item.runtime,
      isFavorite: !!item.is_favorite,
      watchlist: !!item.watchlist,
      userRating: item.user_rating,
      notes: item.notes,
      tags: item.tags_json ? JSON.parse(item.tags_json) : [],
      addedAt: item.added_at,
    }));

    res.json({ success: true, library });
  }),
);

/**
 * POST /sync/library
 * Sync full library from client (client wins). Body: { profileId?, library: [] }
 */
router.post(
  "/library",
  validateBody(syncLibrarySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { library } = req.body as { library: any[] };
    const pid = resolveProfileId(req);
    const db = getDb();

    db.transaction(() => {
      // Delete existing entries for this user+profile, then insert fresh
      db.prepare(
        `DELETE FROM library WHERE user_id = ? ${profileWhere(pid)}`,
      ).run(req.userId, ...profileParams(pid));

      const insertStmt = db.prepare(`
        INSERT INTO library (
          id, user_id, profile_id, imdb_id, media_type, title, year, poster, backdrop,
          rating, genres_json, runtime, is_favorite, watchlist, user_rating,
          notes, tags_json, added_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const item of library) {
        insertStmt.run(
          item.id || uuidv4(),
          req.userId,
          pid,
          item.imdbId,
          item.type,
          item.title,
          item.year,
          item.poster,
          item.backdrop,
          item.rating,
          item.genres ? JSON.stringify(item.genres) : null,
          item.runtime,
          item.isFavorite ? 1 : 0,
          item.watchlist ? 1 : 0,
          item.userRating,
          item.notes,
          item.tags ? JSON.stringify(item.tags) : null,
          item.addedAt || new Date().toISOString(),
        );
      }
    })();

    res.json({
      success: true,
      message: "Library synced",
      count: library.length,
    });
  }),
);

// =============================================================================
// WATCH HISTORY SYNC
// =============================================================================

/**
 * GET /sync/history?profileId=xxx
 */
router.get(
  "/history",
  asyncHandler(async (req: Request, res: Response) => {
    const db = getDb();
    const pid = resolveProfileId(req);

    const items = db
      .prepare(
        `SELECT * FROM watch_history WHERE user_id = ? ${profileWhere(pid)} ORDER BY last_watched_at DESC`,
      )
      .all(req.userId, ...profileParams(pid));

    // Transform to match desktop format
    const history = items.map((item: any) => ({
      id: item.id,
      imdbId: item.imdb_id,
      type: item.season ? "series" : "movie",
      title: item.title,
      poster: item.poster,
      season: item.season,
      episode: item.episode,
      episodeTitle: item.episode_title,
      progress:
        item.duration_seconds > 0
          ? Math.round((item.progress_seconds / item.duration_seconds) * 100)
          : 0,
      duration: item.duration_seconds,
      currentTime: item.current_time || item.progress_seconds,
      watchedAt: item.last_watched_at,
      subtitleId: item.subtitle_id,
      subtitleOffset: item.subtitle_offset,
      audioTrackId: item.audio_track_id,
      torrentInfoHash: item.torrent_info_hash,
      torrentTitle: item.torrent_title,
      torrentQuality: item.torrent_quality,
      torrentProvider: item.torrent_provider,
    }));

    res.json({ success: true, history });
  }),
);

/**
 * POST /sync/history
 * Body: { profileId?, history: [] }
 */
router.post(
  "/history",
  validateBody(syncHistorySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { history } = req.body as { history: any[] };
    const pid = resolveProfileId(req);
    const db = getDb();

    db.transaction(() => {
      db.prepare(
        `DELETE FROM watch_history WHERE user_id = ? ${profileWhere(pid)}`,
      ).run(req.userId, ...profileParams(pid));

      const insertStmt = db.prepare(`
        INSERT INTO watch_history (
          id, user_id, profile_id, imdb_id, season, episode, progress_seconds, duration_seconds,
          last_watched_at, title, poster, episode_title, current_time,
          subtitle_id, subtitle_offset, audio_track_id,
          torrent_info_hash, torrent_title, torrent_quality, torrent_provider
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const item of history) {
        const progressSeconds =
          item.currentTime || Math.round((item.progress / 100) * item.duration);
        insertStmt.run(
          item.id || uuidv4(),
          req.userId,
          pid,
          item.imdbId,
          item.season || null,
          item.episode || null,
          progressSeconds,
          item.duration || 0,
          item.watchedAt || new Date().toISOString(),
          item.title,
          item.poster,
          item.episodeTitle,
          item.currentTime || progressSeconds,
          item.subtitleId,
          item.subtitleOffset,
          item.audioTrackId,
          item.torrentInfoHash,
          item.torrentTitle,
          item.torrentQuality,
          item.torrentProvider,
        );
      }
    })();

    res.json({
      success: true,
      message: "History synced",
      count: history.length,
    });
  }),
);

// =============================================================================
// COLLECTIONS SYNC
// =============================================================================

/**
 * GET /sync/collections?profileId=xxx
 */
router.get(
  "/collections",
  asyncHandler(async (req: Request, res: Response) => {
    const db = getDb();
    const pid = resolveProfileId(req);

    const items = db
      .prepare(
        `SELECT * FROM collections WHERE user_id = ? ${profileWhere(pid)} ORDER BY updated_at DESC`,
      )
      .all(req.userId, ...profileParams(pid));

    const collections = items.map((item: any) => ({
      id: item.id,
      name: item.name,
      description: item.description,
      items: item.items_json ? JSON.parse(item.items_json) : [],
      createdAt: item.created_at,
      updatedAt: item.updated_at,
    }));

    res.json({ success: true, collections });
  }),
);

/**
 * POST /sync/collections
 * Body: { profileId?, collections: [] }
 */
router.post(
  "/collections",
  validateBody(syncCollectionsSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { collections } = req.body as { collections: any[] };
    const pid = resolveProfileId(req);
    const db = getDb();

    // Clear existing collections for this user+profile and replace with client data
    db.prepare(
      `DELETE FROM collections WHERE user_id = ? ${profileWhere(pid)}`,
    ).run(req.userId, ...profileParams(pid));

    const insertStmt = db.prepare(`
      INSERT INTO collections (id, user_id, profile_id, name, description, items_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const syncMany = db.transaction((items: any[]) => {
      for (const item of items) {
        insertStmt.run(
          item.id || uuidv4(),
          req.userId,
          pid,
          item.name,
          item.description,
          JSON.stringify(item.items || []),
          item.createdAt || new Date().toISOString(),
          item.updatedAt || new Date().toISOString(),
        );
      }
    });

    syncMany(collections);

    res.json({
      success: true,
      message: "Collections synced",
      count: collections.length,
    });
  }),
);

// =============================================================================
// SETTINGS SYNC (Debrid keys, scrapers, preferences)
// =============================================================================

/**
 * GET /sync/settings?profileId=xxx
 */
router.get(
  "/settings",
  asyncHandler(async (req: Request, res: Response) => {
    const db = getDb();
    const pid = resolveProfileId(req);

    const row = db
      .prepare(
        `SELECT settings_json FROM user_settings WHERE user_id = ? ${profileWhere(pid)}`,
      )
      .get(req.userId, ...profileParams(pid)) as
      | { settings_json: string }
      | undefined;

    const settings = row ? JSON.parse(row.settings_json) : {};

    res.json({ success: true, settings });
  }),
);

/**
 * POST /sync/settings
 * Body: { profileId?, settings: {} }
 */
router.post(
  "/settings",
  validateBody(syncSettingsSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { settings } = req.body as { settings: Record<string, any> };
    const pid = resolveProfileId(req);
    const db = getDb();

    if (pid) {
      const existing = db
        .prepare(
          `SELECT 1 FROM user_settings WHERE user_id = ? AND profile_id = ?`,
        )
        .get(req.userId, pid);

      if (existing) {
        db.prepare(
          `UPDATE user_settings SET settings_json = ?, updated_at = datetime('now')
           WHERE user_id = ? AND profile_id = ?`,
        ).run(JSON.stringify(settings), req.userId, pid);
      } else {
        db.prepare(
          `INSERT INTO user_settings (user_id, profile_id, settings_json, updated_at)
           VALUES (?, ?, ?, datetime('now'))`,
        ).run(req.userId, pid, JSON.stringify(settings));
      }
    } else {
      db.prepare(
        `INSERT INTO user_settings (user_id, settings_json, updated_at)
         VALUES (?, ?, datetime('now'))
         ON CONFLICT(user_id) DO UPDATE SET
           settings_json = excluded.settings_json,
           updated_at = datetime('now')`,
      ).run(req.userId, JSON.stringify(settings));
    }

    res.json({ success: true, message: "Settings synced" });
  }),
);

// =============================================================================
// FULL SYNC (All data at once)
// =============================================================================

/**
 * GET /sync/all?profileId=xxx
 * Get all user data in one request (for initial login on new device)
 */
router.get(
  "/all",
  asyncHandler(async (req: Request, res: Response) => {
    const db = getDb();
    const pid = resolveProfileId(req);
    const pW = profileWhere(pid);
    const pP = profileParams(pid);

    // Library
    const libraryItems = db
      .prepare(
        `SELECT * FROM library WHERE user_id = ? ${pW} ORDER BY added_at DESC`,
      )
      .all(req.userId, ...pP);
    const library = libraryItems.map((item: any) => ({
      id: item.id,
      imdbId: item.imdb_id,
      type: item.media_type,
      title: item.title,
      year: item.year,
      poster: item.poster,
      backdrop: item.backdrop,
      rating: item.rating,
      genres: item.genres_json ? JSON.parse(item.genres_json) : [],
      runtime: item.runtime,
      isFavorite: !!item.is_favorite,
      watchlist: !!item.watchlist,
      userRating: item.user_rating,
      notes: item.notes,
      tags: item.tags_json ? JSON.parse(item.tags_json) : [],
      addedAt: item.added_at,
    }));

    // History
    const historyItems = db
      .prepare(
        `SELECT * FROM watch_history WHERE user_id = ? ${pW} ORDER BY last_watched_at DESC`,
      )
      .all(req.userId, ...pP);
    const history = historyItems.map((item: any) => ({
      id: item.id,
      imdbId: item.imdb_id,
      type: item.season ? "series" : "movie",
      title: item.title,
      poster: item.poster,
      season: item.season,
      episode: item.episode,
      episodeTitle: item.episode_title,
      progress:
        item.duration_seconds > 0
          ? Math.round((item.progress_seconds / item.duration_seconds) * 100)
          : 0,
      duration: item.duration_seconds,
      currentTime: item.current_time || item.progress_seconds,
      watchedAt: item.last_watched_at,
      subtitleId: item.subtitle_id,
      subtitleOffset: item.subtitle_offset,
      audioTrackId: item.audio_track_id,
      torrentInfoHash: item.torrent_info_hash,
      torrentTitle: item.torrent_title,
      torrentQuality: item.torrent_quality,
      torrentProvider: item.torrent_provider,
    }));

    // Collections
    const collectionItems = db
      .prepare(
        `SELECT * FROM collections WHERE user_id = ? ${pW} ORDER BY updated_at DESC`,
      )
      .all(req.userId, ...pP);
    const collections = collectionItems.map((item: any) => ({
      id: item.id,
      name: item.name,
      description: item.description,
      items: item.items_json ? JSON.parse(item.items_json) : [],
      createdAt: item.created_at,
      updatedAt: item.updated_at,
    }));

    // Settings
    const settingsRow = db
      .prepare(
        `SELECT settings_json FROM user_settings WHERE user_id = ? ${pW}`,
      )
      .get(req.userId, ...pP) as { settings_json: string } | undefined;
    const settings = settingsRow ? JSON.parse(settingsRow.settings_json) : {};

    // Also return profiles list (always user-level, not profile-scoped)
    const profileRows = db
      .prepare(
        `SELECT * FROM profiles WHERE user_id = ? ORDER BY created_at ASC`,
      )
      .all(req.userId) as any[];
    const profiles = profileRows.map((p: any) => ({
      id: p.id,
      name: p.name,
      avatarColor: p.avatar_color,
      avatarIcon: p.avatar_icon,
      isKid: !!p.is_kid,
      createdAt: p.created_at,
    }));

    res.json({
      success: true,
      data: {
        library,
        history,
        collections,
        settings,
        profiles,
      },
    });
  }),
);

/**
 * POST /sync/all
 * Sync all user data in one request. Body: { profileId?, library, history, collections, settings }
 */
router.post(
  "/all",
  validateBody(syncAllSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { library, history, collections, settings } = req.body;
    const pid = resolveProfileId(req);
    const db = getDb();

    const results: Record<string, { success: boolean; count?: number }> = {};

    db.transaction(() => {
      // Sync library
      if (Array.isArray(library)) {
        db.prepare(
          `DELETE FROM library WHERE user_id = ? ${profileWhere(pid)}`,
        ).run(req.userId, ...profileParams(pid));

        const insertLib = db.prepare(`
          INSERT INTO library (
            id, user_id, profile_id, imdb_id, media_type, title, year, poster, backdrop,
            rating, genres_json, runtime, is_favorite, watchlist, user_rating,
            notes, tags_json, added_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const item of library) {
          insertLib.run(
            item.id || uuidv4(),
            req.userId,
            pid,
            item.imdbId,
            item.type,
            item.title,
            item.year,
            item.poster,
            item.backdrop,
            item.rating,
            item.genres ? JSON.stringify(item.genres) : null,
            item.runtime,
            item.isFavorite ? 1 : 0,
            item.watchlist ? 1 : 0,
            item.userRating,
            item.notes,
            item.tags ? JSON.stringify(item.tags) : null,
            item.addedAt || new Date().toISOString(),
          );
        }
        results.library = { success: true, count: library.length };
      }

      // Sync history
      if (Array.isArray(history)) {
        db.prepare(
          `DELETE FROM watch_history WHERE user_id = ? ${profileWhere(pid)}`,
        ).run(req.userId, ...profileParams(pid));

        const insertHist = db.prepare(`
          INSERT INTO watch_history (
            id, user_id, profile_id, imdb_id, season, episode, progress_seconds, duration_seconds,
            last_watched_at, title, poster, episode_title, current_time,
            subtitle_id, subtitle_offset, audio_track_id,
            torrent_info_hash, torrent_title, torrent_quality, torrent_provider
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const item of history) {
          const progressSeconds =
            item.currentTime ||
            Math.round((item.progress / 100) * item.duration);
          insertHist.run(
            item.id || uuidv4(),
            req.userId,
            pid,
            item.imdbId,
            item.season || null,
            item.episode || null,
            progressSeconds,
            item.duration || 0,
            item.watchedAt || new Date().toISOString(),
            item.title,
            item.poster,
            item.episodeTitle,
            item.currentTime || progressSeconds,
            item.subtitleId,
            item.subtitleOffset,
            item.audioTrackId,
            item.torrentInfoHash,
            item.torrentTitle,
            item.torrentQuality,
            item.torrentProvider,
          );
        }
        results.history = { success: true, count: history.length };
      }

      // Sync collections
      if (Array.isArray(collections)) {
        db.prepare(
          `DELETE FROM collections WHERE user_id = ? ${profileWhere(pid)}`,
        ).run(req.userId, ...profileParams(pid));

        const insertCol = db.prepare(`
          INSERT INTO collections (id, user_id, profile_id, name, description, items_json, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const item of collections) {
          insertCol.run(
            item.id || uuidv4(),
            req.userId,
            pid,
            item.name,
            item.description,
            JSON.stringify(item.items || []),
            item.createdAt || new Date().toISOString(),
            item.updatedAt || new Date().toISOString(),
          );
        }
        results.collections = { success: true, count: collections.length };
      }

      // Sync settings
      if (settings && typeof settings === "object") {
        if (pid) {
          const existing = db
            .prepare(
              `SELECT 1 FROM user_settings WHERE user_id = ? AND profile_id = ?`,
            )
            .get(req.userId, pid);

          if (existing) {
            db.prepare(
              `UPDATE user_settings SET settings_json = ?, updated_at = datetime('now')
               WHERE user_id = ? AND profile_id = ?`,
            ).run(JSON.stringify(settings), req.userId, pid);
          } else {
            db.prepare(
              `INSERT INTO user_settings (user_id, profile_id, settings_json, updated_at)
               VALUES (?, ?, ?, datetime('now'))`,
            ).run(req.userId, pid, JSON.stringify(settings));
          }
        } else {
          db.prepare(
            `INSERT INTO user_settings (user_id, settings_json, updated_at)
             VALUES (?, ?, datetime('now'))
             ON CONFLICT(user_id) DO UPDATE SET
               settings_json = excluded.settings_json,
               updated_at = datetime('now')`,
          ).run(req.userId, JSON.stringify(settings));
        }
        results.settings = { success: true };
      }
    })();

    res.json({ success: true, message: "Full sync complete", results });
  }),
);

export default router;
