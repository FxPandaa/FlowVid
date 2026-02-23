/**
 * FlowVid API - Authentication Middleware
 * JWT verification and request authentication
 */

import { Request, Response, NextFunction } from "express";
import jwt, { SignOptions } from "jsonwebtoken";
import config from "../config/index.js";
import { JWTPayload } from "../types/index.js";
import { UnauthorizedError } from "../utils/errors.js";

/**
 * Extract JWT token from Authorization header
 */
function extractToken(req: Request): string | null {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return null;
  }

  // Support both "Bearer <token>" and raw token
  if (authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }

  return authHeader;
}

/**
 * Verify JWT token and extract payload
 */
function verifyToken(token: string): JWTPayload {
  try {
    const decoded = jwt.verify(token, config.jwt.secret) as JWTPayload;
    return decoded;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new UnauthorizedError("Token has expired");
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new UnauthorizedError("Invalid token");
    }
    throw new UnauthorizedError("Token verification failed");
  }
}

/**
 * Authentication middleware - requires valid JWT
 * Adds user info to request object
 */
export function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  try {
    const token = extractToken(req);

    if (!token) {
      throw new UnauthorizedError("No authentication token provided");
    }

    const payload = verifyToken(token);

    // Add user info to request
    req.userId = payload.userId;
    req.userEmail = payload.email;

    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Optional authentication - doesn't fail if no token
 * Useful for endpoints that behave differently for authenticated users
 */
export function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  try {
    const token = extractToken(req);

    if (token) {
      const payload = verifyToken(token);
      req.userId = payload.userId;
      req.userEmail = payload.email;
    }

    next();
  } catch {
    // Silently ignore auth errors for optional auth
    next();
  }
}

/**
 * Generate JWT tokens (access + refresh)
 */
export function generateTokens(
  userId: string,
  email: string,
): {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
} {
  const payload: JWTPayload = { userId, email };

  // Use type assertion to satisfy jsonwebtoken's StringValue type
  const accessToken = jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
  } as SignOptions);

  const refreshToken = jwt.sign(
    { userId, type: "refresh" },
    config.jwt.secret,
    { expiresIn: config.jwt.refreshExpiresIn } as SignOptions,
  );

  // Calculate expiration in seconds
  const decoded = jwt.decode(accessToken) as { exp: number; iat: number };
  const expiresIn = decoded.exp - decoded.iat;

  return {
    accessToken,
    refreshToken,
    expiresIn,
  };
}

/**
 * Verify refresh token
 */
export function verifyRefreshToken(token: string): { userId: string } {
  try {
    const decoded = jwt.verify(token, config.jwt.secret) as {
      userId: string;
      type: string;
    };

    if (decoded.type !== "refresh") {
      throw new UnauthorizedError("Invalid refresh token");
    }

    return { userId: decoded.userId };
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new UnauthorizedError("Refresh token has expired");
    }
    throw new UnauthorizedError("Invalid refresh token");
  }
}

export default {
  authenticate,
  optionalAuth,
  generateTokens,
  verifyRefreshToken,
};
