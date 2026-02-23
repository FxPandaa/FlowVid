/**
 * FlowVid API - Database Management
 * SQLite database with better-sqlite3 for synchronous, fast operations
 */

import Database from "better-sqlite3";
import { mkdirSync, existsSync } from "fs";
import { dirname } from "path";
import config from "../config/index.js";

let db: Database.Database | null = null;

/**
 * Get the database instance (singleton pattern)
 */
export function getDb(): Database.Database {
  if (!db) {
    throw new Error("Database not initialized. Call initDatabase() first.");
  }
  return db;
}

/**
 * Initialize the database connection and create tables
 */
export function initDatabase(): Database.Database {
  const dbPath = config.database.path;

  // Ensure the directory exists
  const dbDir = dirname(dbPath);
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }

  // Create database connection
  db = new Database(dbPath);

  // Enable WAL mode for better concurrent performance
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  // Create tables
  createTables(db);

  console.log(`📦 Database initialized at: ${dbPath}`);

  return db;
}

/**
 * Create all database tables
 */
function createTables(database: Database.Database): void {
  // Users table (simplified - no debrid storage, that's in the app)
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
  `);

  // User preferences table
  database.exec(`
    CREATE TABLE IF NOT EXISTS user_preferences (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      preferred_quality TEXT DEFAULT 'auto' CHECK(preferred_quality IN ('auto', '4K', '1080p', '720p', '480p')),
      subtitle_language TEXT,
      audio_language TEXT,
      autoplay_next_episode INTEGER DEFAULT 1
    );
  `);

  // Library table (watchlist/favorites - synced across devices)
  database.exec(`
    CREATE TABLE IF NOT EXISTS library (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      imdb_id TEXT NOT NULL,
      media_type TEXT NOT NULL CHECK(media_type IN ('movie', 'series')),
      added_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, imdb_id)
    );
    CREATE INDEX IF NOT EXISTS idx_library_user_id ON library(user_id);
    CREATE INDEX IF NOT EXISTS idx_library_imdb_id ON library(imdb_id);
  `);

  // Watch history table (synced across devices)
  database.exec(`
    CREATE TABLE IF NOT EXISTS watch_history (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      imdb_id TEXT NOT NULL,
      season INTEGER,
      episode INTEGER,
      progress_seconds INTEGER NOT NULL DEFAULT 0,
      duration_seconds INTEGER NOT NULL DEFAULT 0,
      last_watched_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, imdb_id, season, episode)
    );
    CREATE INDEX IF NOT EXISTS idx_watch_history_user_id ON watch_history(user_id);
    CREATE INDEX IF NOT EXISTS idx_watch_history_last_watched ON watch_history(last_watched_at);
  `);

  // Metadata cache table (for caching Cinemeta responses)
  database.exec(`
    CREATE TABLE IF NOT EXISTS metadata_cache (
      imdb_id TEXT PRIMARY KEY,
      media_type TEXT NOT NULL CHECK(media_type IN ('movie', 'series')),
      metadata_json TEXT NOT NULL,
      cached_at TEXT DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_metadata_cache_expires ON metadata_cache(expires_at);
  `);

  // Refresh tokens table (for secure token refresh)
  database.exec(`
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires ON refresh_tokens(expires_at);
  `);

  // Collections table (user-created collections - synced across devices)
  database.exec(`
    CREATE TABLE IF NOT EXISTS collections (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      items_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_collections_user_id ON collections(user_id);
  `);

  // User settings sync table (debrid keys, scrapers, preferences - synced across devices)
  database.exec(`
    CREATE TABLE IF NOT EXISTS user_settings (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      settings_json TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // =========================================================================
  // BILLING & VENDOR PROVISIONING TABLES
  // =========================================================================

  // Subscriptions table (one per user)
  database.exec(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT UNIQUE,
      status TEXT NOT NULL DEFAULT 'not_subscribed',
      plan TEXT NOT NULL DEFAULT 'standard',
      current_period_start TEXT,
      current_period_end TEXT,
      cancel_at_period_end INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
    CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
    CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_sub ON subscriptions(stripe_subscription_id);
  `);

  // TorBox vendor users table (maps our users to TorBox vendor accounts)
  database.exec(`
    CREATE TABLE IF NOT EXISTS torbox_users (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      subscription_id TEXT REFERENCES subscriptions(id),
      vendor_user_auth_id TEXT,
      torbox_email TEXT NOT NULL,
      torbox_api_token_encrypted TEXT,
      status TEXT NOT NULL DEFAULT 'pending_provision',
      provision_attempts INTEGER DEFAULT 0,
      last_provision_attempt TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      revoked_at TEXT,
      UNIQUE(user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_torbox_users_user_id ON torbox_users(user_id);
    CREATE INDEX IF NOT EXISTS idx_torbox_users_status ON torbox_users(status);
    CREATE INDEX IF NOT EXISTS idx_torbox_users_auth_id ON torbox_users(vendor_user_auth_id);
  `);

  // Audit log for billing events
  database.exec(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      event_type TEXT NOT NULL,
      event_data TEXT,
      correlation_id TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON audit_log(user_id);
    CREATE INDEX IF NOT EXISTS idx_audit_log_event_type ON audit_log(event_type);
    CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at);
  `);

  // Vendor capacity snapshots
  database.exec(`
    CREATE TABLE IF NOT EXISTS vendor_capacity (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      users_allowed INTEGER NOT NULL,
      current_users INTEGER NOT NULL,
      vendor_status TEXT NOT NULL,
      recorded_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Stripe webhook idempotency table
  database.exec(`
    CREATE TABLE IF NOT EXISTS webhook_events (
      event_id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      processed_at TEXT DEFAULT (datetime('now')),
      result TEXT
    );
  `);

  // =========================================================================
  // USER PROFILES TABLE (up to 8 per account)
  // =========================================================================
  database.exec(`
    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      avatar_color TEXT NOT NULL DEFAULT '#00E5FF',
      avatar_icon TEXT NOT NULL DEFAULT '😊',
      is_kid INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON profiles(user_id);
  `);

  // Add profile_id column to library, watch_history, collections, user_settings
  // (nullable so existing data still works; new data will always have a profile_id)
  const addProfileIdColumn = (table: string) => {
    const cols = database.prepare(`PRAGMA table_info(${table})`).all() as {
      name: string;
    }[];
    if (!cols.find((c) => c.name === "profile_id")) {
      database.exec(
        `ALTER TABLE ${table} ADD COLUMN profile_id TEXT REFERENCES profiles(id) ON DELETE CASCADE`,
      );
      database.exec(
        `CREATE INDEX IF NOT EXISTS idx_${table}_profile_id ON ${table}(profile_id)`,
      );
    }
  };

  addProfileIdColumn("library");
  addProfileIdColumn("watch_history");
  addProfileIdColumn("collections");
  addProfileIdColumn("user_settings");

  // Extended library table with full metadata for sync (add columns if they don't exist)
  const libraryColumns = database
    .prepare("PRAGMA table_info(library)")
    .all() as { name: string }[];
  const libraryColumnNames = libraryColumns.map((c) => c.name);

  const libraryNewColumns = [
    { name: "title", type: "TEXT" },
    { name: "year", type: "INTEGER" },
    { name: "poster", type: "TEXT" },
    { name: "backdrop", type: "TEXT" },
    { name: "rating", type: "REAL" },
    { name: "genres_json", type: "TEXT" },
    { name: "runtime", type: "INTEGER" },
    { name: "is_favorite", type: "INTEGER DEFAULT 0" },
    { name: "watchlist", type: "INTEGER DEFAULT 0" },
    { name: "user_rating", type: "INTEGER" },
    { name: "notes", type: "TEXT" },
    { name: "tags_json", type: "TEXT" },
  ];

  for (const col of libraryNewColumns) {
    if (!libraryColumnNames.includes(col.name)) {
      database.exec(`ALTER TABLE library ADD COLUMN ${col.name} ${col.type}`);
    }
  }

  // Extended watch history with playback state for sync (add columns if they don't exist)
  const historyColumns = database
    .prepare("PRAGMA table_info(watch_history)")
    .all() as { name: string }[];
  const historyColumnNames = historyColumns.map((c) => c.name);

  const historyNewColumns = [
    { name: "title", type: "TEXT" },
    { name: "poster", type: "TEXT" },
    { name: "episode_title", type: "TEXT" },
    { name: "current_time", type: "REAL" },
    { name: "subtitle_id", type: "TEXT" },
    { name: "subtitle_offset", type: "REAL" },
    { name: "audio_track_id", type: "TEXT" },
    { name: "torrent_info_hash", type: "TEXT" },
    { name: "torrent_title", type: "TEXT" },
    { name: "torrent_quality", type: "TEXT" },
    { name: "torrent_provider", type: "TEXT" },
  ];

  for (const col of historyNewColumns) {
    if (!historyColumnNames.includes(col.name)) {
      database.exec(
        `ALTER TABLE watch_history ADD COLUMN ${col.name} ${col.type}`,
      );
    }
  }
}

/**
 * Close the database connection
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
    console.log("📦 Database connection closed");
  }
}

/**
 * Cleanup expired cache entries (run periodically)
 */
export function cleanupExpiredCache(): void {
  const database = getDb();
  const now = new Date().toISOString();

  const metadataDeleted = database
    .prepare(`DELETE FROM metadata_cache WHERE expires_at < ?`)
    .run(now);

  const tokensDeleted = database
    .prepare(`DELETE FROM refresh_tokens WHERE expires_at < ?`)
    .run(now);

  if (config.server.isDevelopment) {
    console.log(
      `🧹 Cache cleanup: ${metadataDeleted.changes} metadata, ${tokensDeleted.changes} tokens`,
    );
  }
}

export default {
  getDb,
  initDatabase,
  closeDatabase,
  cleanupExpiredCache,
};
