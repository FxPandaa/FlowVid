/**
 * FlowVid API - Authentication Routes
 * Handles user registration, login, and token refresh
 */

import { Router, Request, Response } from "express";
import bcrypt from "bcrypt";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "../database/index.js";
import {
  generateTokens,
  verifyRefreshToken,
  authenticate,
} from "../middleware/auth.js";
import { asyncHandler, validateBody } from "../middleware/errorHandler.js";
import {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
} from "../utils/validation.js";
import {
  ConflictError,
  UnauthorizedError,
  NotFoundError,
} from "../utils/errors.js";
import crypto from "crypto";
import type { User } from "../types/index.js";

const router = Router();

const BCRYPT_ROUNDS = 12;

/**
 * Hash a token for secure storage
 */
function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * POST /auth/register
 * Create a new user account
 */
router.post(
  "/register",
  validateBody(registerSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { email, username, password } = req.body as { email: string; username: string; password: string };
    const db = getDb();

    // Hash password before transaction (async, don't block inside tx)
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    // Atomic registration: check + insert in a single transaction
    const userId = uuidv4();
    const tokens = generateTokens(userId, email.toLowerCase());
    const refreshTokenHash = hashToken(tokens.refreshToken);
    const refreshExpiresAt = new Date(
      Date.now() + 30 * 24 * 60 * 60 * 1000,
    ).toISOString();

    const registerTx = db.transaction(() => {
      // Check if email already exists (inside tx to prevent race)
      const existing = db
        .prepare("SELECT id FROM users WHERE email = ?")
        .get(email.toLowerCase());
      if (existing) {
        throw new ConflictError("Email already registered");
      }

      // Create user
      db.prepare(
        `INSERT INTO users (id, email, username, password_hash) VALUES (?, ?, ?, ?)`,
      ).run(userId, email.toLowerCase(), username, passwordHash);

      // Create default preferences
      db.prepare(`INSERT INTO user_preferences (user_id) VALUES (?)`).run(
        userId,
      );

      // Store refresh token hash
      db.prepare(
        `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)`,
      ).run(uuidv4(), userId, refreshTokenHash, refreshExpiresAt);
    });

    registerTx();

    res.status(201).json({
      success: true,
      data: {
        user: {
          id: userId,
          email: email.toLowerCase(),
          username,
          createdAt: new Date().toISOString(),
        },
        tokens: {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresIn: tokens.expiresIn,
        },
      },
      message:
        "Account created successfully. Add your debrid API key to start streaming.",
    });
  }),
);

/**
 * POST /auth/login
 * Login with email and password
 */
router.post(
  "/login",
  validateBody(loginSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { email, password } = req.body as { email: string; password: string };
    const db = getDb();

    // Find user
    const user = db
      .prepare(
        `SELECT id, email, username, password_hash, created_at FROM users WHERE email = ?`,
      )
      .get(email.toLowerCase()) as User | undefined;

    if (!user) {
      throw new UnauthorizedError("Invalid email or password");
    }

    // Verify password
    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      throw new UnauthorizedError("Invalid email or password");
    }

    // Generate tokens
    const tokens = generateTokens(user.id, user.email);

    // Store refresh token hash
    const refreshTokenHash = hashToken(tokens.refreshToken);
    const refreshExpiresAt = new Date(
      Date.now() + 30 * 24 * 60 * 60 * 1000,
    ).toISOString();

    db.prepare(
      `
      INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at)
      VALUES (?, ?, ?, ?)
    `,
    ).run(uuidv4(), user.id, refreshTokenHash, refreshExpiresAt);

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          username: user.username || '',
          createdAt: user.created_at,
        },
        tokens: {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresIn: tokens.expiresIn,
        },
      },
    });
  }),
);

/**
 * POST /auth/refresh
 * Refresh access token using refresh token
 */
router.post(
  "/refresh",
  validateBody(refreshTokenSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { refreshToken } = req.body as { refreshToken: string };
    const db = getDb();

    // Verify the JWT refresh token signature
    const { userId } = verifyRefreshToken(refreshToken);
    const tokenHash = hashToken(refreshToken);

    // Atomic: verify stored token + delete old + insert new — prevents double-refresh race
    const refreshTx = db.transaction(() => {
      // Check if token exists in database
      const storedToken = db
        .prepare(
          `SELECT id FROM refresh_tokens
           WHERE user_id = ? AND token_hash = ? AND expires_at > datetime('now')`,
        )
        .get(userId, tokenHash);

      if (!storedToken) {
        throw new UnauthorizedError("Invalid or expired refresh token");
      }

      // Get user
      const user = db
        .prepare(`SELECT id, email, username FROM users WHERE id = ?`)
        .get(userId) as { id: string; email: string; username?: string } | undefined;

      if (!user) {
        throw new NotFoundError("User not found");
      }

      // Delete old refresh token
      db.prepare("DELETE FROM refresh_tokens WHERE token_hash = ?").run(
        tokenHash,
      );

      // Generate new tokens
      const tokens = generateTokens(user.id, user.email);

      // Store new refresh token
      const newRefreshTokenHash = hashToken(tokens.refreshToken);
      const refreshExpiresAt = new Date(
        Date.now() + 30 * 24 * 60 * 60 * 1000,
      ).toISOString();

      db.prepare(
        `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at)
         VALUES (?, ?, ?, ?)`,
      ).run(uuidv4(), user.id, newRefreshTokenHash, refreshExpiresAt);

      return tokens;
    });

    const tokens = refreshTx();

    // Get user info to return alongside tokens
    const refreshedUser = db
      .prepare(`SELECT id, email, username FROM users WHERE id = ?`)
      .get(userId) as { id: string; email: string; username?: string } | undefined;

    res.json({
      success: true,
      data: {
        user: refreshedUser ? {
          id: refreshedUser.id,
          email: refreshedUser.email,
          username: refreshedUser.username || '',
        } : undefined,
        tokens: {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresIn: tokens.expiresIn,
        },
      },
    });
  }),
);

/**
 * POST /auth/logout
 * Logout and invalidate refresh token
 */
router.post(
  "/logout",
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const { refreshToken } = req.body as { refreshToken?: string };
    const db = getDb();

    if (refreshToken) {
      const tokenHash = hashToken(refreshToken);
      db.prepare("DELETE FROM refresh_tokens WHERE token_hash = ?").run(
        tokenHash,
      );
    } else {
      // Delete all refresh tokens for this user
      db.prepare("DELETE FROM refresh_tokens WHERE user_id = ?").run(
        req.userId,
      );
    }

    res.json({
      success: true,
      message: "Logged out successfully",
    });
  }),
);

export default router;
