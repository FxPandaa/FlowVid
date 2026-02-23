/**
 * FlowVid API - Metadata Routes
 * Proxy to Cinemeta API with caching
 */

import { Router, Request, Response } from "express";
import { optionalAuth } from "../middleware/auth.js";
import { asyncHandler, validateParams } from "../middleware/errorHandler.js";
import { imdbIdParamSchema } from "../utils/validation.js";
import {
  getMetadata,
  searchContent,
  getPopular,
  getSeriesEpisodes,
} from "../services/metadata/index.js";
import { MediaType } from "../types/index.js";

const router = Router();

/**
 * GET /metadata/movie/:imdbId
 * Get movie metadata
 */
router.get(
  "/movie/:imdbId",
  optionalAuth, // Allow unauthenticated for browsing
  validateParams(imdbIdParamSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const imdbId = req.params.imdbId as string;

    const metadata = await getMetadata(imdbId, MediaType.MOVIE);

    res.json({
      success: true,
      data: metadata,
    });
  }),
);

/**
 * GET /metadata/series/:imdbId
 * Get series metadata with episodes
 */
router.get(
  "/series/:imdbId",
  optionalAuth,
  validateParams(imdbIdParamSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const imdbId = req.params.imdbId as string;
    const season = req.query.season
      ? parseInt(req.query.season as string)
      : undefined;

    const metadata = await getSeriesEpisodes(imdbId, season);

    res.json({
      success: true,
      data: metadata,
    });
  }),
);

/**
 * GET /metadata/search
 * Search for movies and series
 */
router.get(
  "/search",
  optionalAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const query = req.query.query as string;
    const type = req.query.type as MediaType | undefined;

    if (!query || query.trim().length === 0) {
      res.json({
        success: true,
        data: [],
      });
      return;
    }

    const results = await searchContent(query.trim(), type);

    res.json({
      success: true,
      data: results,
      total: results.length,
    });
  }),
);

/**
 * GET /metadata/popular/movies
 * Get popular movies
 */
router.get(
  "/popular/movies",
  optionalAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const genre = req.query.genre as string | undefined;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

    const results = await getPopular(MediaType.MOVIE, genre, limit);

    res.json({
      success: true,
      data: results,
    });
  }),
);

/**
 * GET /metadata/popular/series
 * Get popular series
 */
router.get(
  "/popular/series",
  optionalAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const genre = req.query.genre as string | undefined;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

    const results = await getPopular(MediaType.SERIES, genre, limit);

    res.json({
      success: true,
      data: results,
    });
  }),
);

/**
 * GET /metadata/genres
 * Get available genres
 */
router.get(
  "/genres",
  asyncHandler(async (_req: Request, res: Response) => {
    // Standard genres available in Cinemeta
    const genres = [
      "Action",
      "Adventure",
      "Animation",
      "Biography",
      "Comedy",
      "Crime",
      "Documentary",
      "Drama",
      "Family",
      "Fantasy",
      "History",
      "Horror",
      "Music",
      "Mystery",
      "Romance",
      "Sci-Fi",
      "Sport",
      "Thriller",
      "War",
      "Western",
    ];

    res.json({
      success: true,
      data: genres,
    });
  }),
);

export default router;
