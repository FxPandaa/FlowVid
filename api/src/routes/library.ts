/**
 * FlowVid API - Library Routes
 * User's watchlist/favorites management
 */

import { Router, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "../database/index.js";
import { authenticate } from "../middleware/auth.js";
import {
  asyncHandler,
  validateBody,
  validateParams,
} from "../middleware/errorHandler.js";
import { addToLibrarySchema, imdbIdParamSchema } from "../utils/validation.js";
import { NotFoundError, ConflictError } from "../utils/errors.js";
import {
  getMetadata,
  getCachedMetadataBatch,
} from "../services/metadata/index.js";
import type { MediaType, LibraryItem } from "../types/index.js";

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /library
 * Get user's library (watchlist)
 */
router.get(
  "/",
  asyncHandler(async (req: Request, res: Response) => {
    const db = getDb();
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = (page - 1) * limit;

    // Get library items
    const items = db
      .prepare(
        `
      SELECT * FROM library 
      WHERE user_id = ?
      ORDER BY added_at DESC
      LIMIT ? OFFSET ?
    `,
      )
      .all(req.userId, limit, offset) as LibraryItem[];

    // Get total count
    const countResult = db
      .prepare(
        `
      SELECT COUNT(*) as count FROM library WHERE user_id = ?
    `,
      )
      .get(req.userId) as { count: number };

    // Batch-fetch metadata from cache in one query (eliminates N+1 HTTP calls)
    const imdbIds = items.map((item) => item.imdb_id);
    const cachedMeta = getCachedMetadataBatch(imdbIds);

    // Only fetch missing metadata from Cinemeta (cache misses)
    const itemsWithMetadata = await Promise.all(
      items.map(async (item) => {
        const cached = cachedMeta.get(item.imdb_id);
        if (cached) return { ...item, metadata: cached };
        try {
          const metadata = await getMetadata(item.imdb_id, item.media_type);
          return { ...item, metadata };
        } catch {
          return { ...item, metadata: null };
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
 * POST /library
 * Add item to library
 */
router.post(
  "/",
  validateBody(addToLibrarySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { imdbId, mediaType } = req.body as {
      imdbId: string;
      mediaType: MediaType;
    };
    const db = getDb();

    // Check if already in library
    const existing = db
      .prepare(
        `
      SELECT id FROM library WHERE user_id = ? AND imdb_id = ?
    `,
      )
      .get(req.userId, imdbId);

    if (existing) {
      throw new ConflictError("Item already in library");
    }

    // Verify the content exists by fetching metadata
    const metadata = await getMetadata(imdbId, mediaType);

    // Add to library
    const id = uuidv4();
    db.prepare(
      `
      INSERT INTO library (id, user_id, imdb_id, media_type)
      VALUES (?, ?, ?, ?)
    `,
    ).run(id, req.userId, imdbId, mediaType);

    res.status(201).json({
      success: true,
      data: {
        id,
        imdbId,
        mediaType,
        addedAt: new Date().toISOString(),
        metadata,
      },
      message: "Added to library",
    });
  }),
);

/**
 * GET /library/:imdbId
 * Check if item is in library
 */
router.get(
  "/:imdbId",
  validateParams(imdbIdParamSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { imdbId } = req.params;
    const db = getDb();

    const item = db
      .prepare(
        `
      SELECT * FROM library WHERE user_id = ? AND imdb_id = ?
    `,
      )
      .get(req.userId, imdbId) as LibraryItem | undefined;

    res.json({
      success: true,
      data: {
        inLibrary: !!item,
        item: item || null,
      },
    });
  }),
);

/**
 * DELETE /library/:imdbId
 * Remove item from library
 */
router.delete(
  "/:imdbId",
  validateParams(imdbIdParamSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { imdbId } = req.params;
    const db = getDb();

    const result = db
      .prepare(
        `
      DELETE FROM library WHERE user_id = ? AND imdb_id = ?
    `,
      )
      .run(req.userId, imdbId);

    if (result.changes === 0) {
      throw new NotFoundError("Item not in library");
    }

    res.json({
      success: true,
      message: "Removed from library",
    });
  }),
);

export default router;
