/**
 * FlowVid API - Main Application Entry Point
 *
 * A lightweight account sync backend for cross-platform streaming
 * Serves Windows, macOS, Linux, Android, iOS, Android TV, and Apple TV
 *
 * ARCHITECTURE:
 * - This backend handles: Authentication, account sync, library, watch history
 * - The apps handle: Scraping, debrid communication, video playback
 * - Users enter debrid keys in app settings (stored locally or synced encrypted)
 */

import express, { Express, Request, Response } from "express";
import cors from "cors";
import compression from "compression";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import config, { validateConfig } from "./config/index.js";
import {
  initDatabase,
  closeDatabase,
  cleanupExpiredCache,
  getDb,
} from "./database/index.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import {
  authRoutes,
  userRoutes,
  libraryRoutes,
  historyRoutes,
  metadataRoutes,
  syncRoutes,
  profileRoutes,
  billingRoutes,
  internalRoutes,
} from "./routes/index.js";
import { clearExpiredMetadataCache } from "./services/metadata/index.js";
import {
  startProvisioningWorker,
  stopProvisioningWorker,
} from "./services/provisioning/worker.js";

// ============================================================================
// APPLICATION SETUP
// ============================================================================

const app: Express = express();

// Trust first proxy (nginx / Cloudflare) so rate-limit sees real client IPs
app.set("trust proxy", 1);

// Security headers (X-Content-Type-Options, Strict-Transport-Security, hides X-Powered-By, etc.)
app.use(helmet());

/**
 * Initialize the application
 */
async function initialize(): Promise<void> {
  console.log("🚀 Starting FlowVid API...");
  console.log(`📍 Environment: ${config.server.nodeEnv}`);

  // Validate configuration
  validateConfig();
  console.log("✅ Configuration validated");

  // Initialize database
  initDatabase();
  console.log("✅ Database initialized");
}

// ============================================================================
// MIDDLEWARE
// ============================================================================

// CORS configuration - allow Tauri apps and web clients
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, Tauri)
      if (!origin) {
        callback(null, true);
        return;
      }

      // Always allow Tauri scheme
      if (origin.startsWith("tauri://")) {
        callback(null, true);
        return;
      }

      // Check configured origins
      if (config.cors.origins.includes(origin)) {
        callback(null, true);
        return;
      }

      // Allow localhost only in development
      if (
        config.server.isDevelopment &&
        (origin.startsWith("http://localhost") ||
          origin.startsWith("https://localhost"))
      ) {
        callback(null, true);
        return;
      }

      if (config.server.isDevelopment) {
        // Allow all origins in development
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

// Gzip compression — reduces sync payloads by ~70-80% for large libraries
app.use(compression());

// Parse JSON bodies (2mb to handle large libraries with full metadata)
app.use(express.json({ limit: "2mb" }));

// Parse URL-encoded bodies
app.use(express.urlencoded({ extended: true, limit: "2mb" }));

// Rate limiting — global
const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  message: {
    success: false,
    error: "Too many requests, please try again later",
    code: "RATE_LIMIT_EXCEEDED",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(limiter);

// Stricter rate limiter for auth endpoints (brute-force protection)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per window per IP
  message: {
    success: false,
    error: "Too many login attempts, please try again later",
    code: "AUTH_RATE_LIMIT_EXCEEDED",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Request logging in development
if (config.server.isDevelopment) {
  app.use((req: Request, _res: Response, next) => {
    console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
    next();
  });
}

// ============================================================================
// ROUTES
// ============================================================================

// Health check — verifies database connectivity
app.get("/health", (_req: Request, res: Response) => {
  try {
    const db = getDb();
    db.prepare("SELECT 1").get();
    res.json({
      success: true,
      status: "healthy",
      timestamp: new Date().toISOString(),
      version: "1.0.0",
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      status: "degraded",
      timestamp: new Date().toISOString(),
      version: "1.0.0",
      error: "Database check failed",
    });
  }
});

// API info
app.get("/", (_req: Request, res: Response) => {
  res.json({
    name: "FlowVid API",
    version: "1.0.0",
    description: "Account sync backend for cross-platform streaming",
    endpoints: {
      auth: "/auth",
      user: "/user",
      library: "/user/library",
      history: "/user/history",
      metadata: "/metadata",
      sync: "/sync",
      billing: "/billing",
      internal: "/internal",
    },
  });
});

// Mount routes (auth gets stricter rate limiter)
app.use("/auth", authLimiter, authRoutes);
app.use("/user", userRoutes);
app.use("/user/library", libraryRoutes);
app.use("/user/history", historyRoutes);
app.use("/metadata", metadataRoutes);
app.use("/sync", syncRoutes);
app.use("/profiles", profileRoutes);
app.use("/billing", billingRoutes);
app.use("/internal", internalRoutes);

// 404 handler
app.use(notFoundHandler);

// Global error handler (must be last)
app.use(errorHandler);

// ============================================================================
// BACKGROUND TASKS
// ============================================================================

/**
 * Periodic cache cleanup
 * Runs every hour to remove expired cache entries
 */
function startCacheCleanupJob(): NodeJS.Timeout {
  const interval = 60 * 60 * 1000; // 1 hour

  return setInterval(() => {
    console.log("🧹 Running cache cleanup...");
    try {
      cleanupExpiredCache();
      clearExpiredMetadataCache();
    } catch (error) {
      console.error("Cache cleanup error:", error);
    }
  }, interval);
}

// ============================================================================
// SERVER STARTUP
// ============================================================================

let cleanupInterval: NodeJS.Timeout;

async function startServer(): Promise<void> {
  try {
    await initialize();

    const server = app.listen(config.server.port, () => {
      console.log(`
╔════════════════════════════════════════════════════════════════╗
║                    🎬 FlowVid API v1.0.0                       ║
╠════════════════════════════════════════════════════════════════╣
║  Server running at: http://localhost:${config.server.port.toString().padEnd(25)}║
║  Environment: ${config.server.nodeEnv.padEnd(43)}║
╠════════════════════════════════════════════════════════════════╣
║  Endpoints:                                                    ║
║    POST /auth/register     - Create account                    ║
║    POST /auth/login        - Login                             ║
║    GET  /user/profile      - Get user profile                  ║
║    GET  /user/library      - Synced library                    ║
║    GET  /user/history      - Watch history                     ║
║    GET  /metadata/search   - Search movies/series              ║
║    GET  /billing/status    - Subscription status               ║
║    POST /billing/checkout  - Start payment                     ║
║    GET  /internal/health   - Operator health check             ║
╠════════════════════════════════════════════════════════════════╣
║  NOTE: Scraping & debrid handled in apps, not server           ║
╚════════════════════════════════════════════════════════════════╝
      `);
    });

    // Start background jobs
    cleanupInterval = startCacheCleanupJob();

    // Start the billing provisioning worker
    startProvisioningWorker();

    // Graceful shutdown
    const shutdown = async () => {
      console.log("\n🛑 Shutting down gracefully...");

      clearInterval(cleanupInterval);
      stopProvisioningWorker();

      server.close(() => {
        closeDatabase();
        console.log("👋 Goodbye!");
        process.exit(0);
      });

      // Force exit after 10 seconds
      setTimeout(() => {
        console.error("❌ Forced shutdown after timeout");
        process.exit(1);
      }, 10000);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);

    // Crash handlers — log and exit so PM2/systemd can restart
    process.on("unhandledRejection", (reason) => {
      console.error("Unhandled promise rejection:", reason);
    });
    process.on("uncaughtException", (error) => {
      console.error("Uncaught exception:", error);
      // Exit so the process manager restarts cleanly
      process.exit(1);
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
}

// Start the server
startServer();

export default app;
