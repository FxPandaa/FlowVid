/**
 * FlowVid API - Automated Backup Service
 *
 * Schedules SQLite backups using better-sqlite3's online .backup() API.
 * Backups are atomic & safe even while the DB is being written to.
 *
 * Features:
 *   - Configurable interval (BACKUP_INTERVAL_HOURS, default 6)
 *   - Retention policy (BACKUP_RETENTION_DAYS, default 30)
 *   - Auto-prunes oldest backups beyond retention window
 *   - Verifies backup integrity by opening & running `PRAGMA integrity_check`
 *   - Manual trigger via POST /internal/backup
 */

import { existsSync, mkdirSync, readdirSync, unlinkSync, statSync } from "fs";
import { join } from "path";
import Database from "better-sqlite3";
import { getDb } from "../../database/index.js";
import config from "../../config/index.js";

// ============================================================================
// TYPES
// ============================================================================

export interface BackupResult {
  success: boolean;
  path: string;
  sizeBytes: number;
  durationMs: number;
  verified: boolean;
  timestamp: string;
}

export interface PruneResult {
  removed: number;
  remaining: number;
  oldestKept: string | null;
}

// ============================================================================
// CORE
// ============================================================================

const BACKUP_PREFIX = "flowvid-backup-";
const BACKUP_EXT = ".db";

let backupTimer: NodeJS.Timeout | null = null;

/**
 * Build a timestamped backup filename
 */
function backupFilename(): string {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  return `${BACKUP_PREFIX}${ts}${BACKUP_EXT}`;
}

/**
 * Create a verified database backup.
 *
 * Uses better-sqlite3's `.backup()` which performs a safe online backup
 * (equivalent to SQLite's backup API — consistent even under concurrent writes).
 */
export async function createBackup(
  targetDir?: string,
): Promise<BackupResult> {
  const dir = targetDir ?? config.backup.dir;

  // Ensure backup directory exists
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const filename = backupFilename();
  const backupPath = join(dir, filename);
  const start = Date.now();

  // Perform atomic online backup
  const db = getDb();
  await db.backup(backupPath);

  const durationMs = Date.now() - start;

  // Verify backup integrity
  let verified = false;
  try {
    const backupDb = new Database(backupPath, { readonly: true });
    // better-sqlite3 .pragma() returns an array of row objects.
    // For integrity_check the key is the PRAGMA name itself.
    const result = backupDb.pragma("integrity_check") as Record<string, string>[];
    const firstValue = result[0] ? Object.values(result[0])[0] : null;
    verified = firstValue === "ok";
    backupDb.close();
  } catch {
    // Verification failed — backup file may be corrupt
    verified = false;
  }

  const stats = statSync(backupPath);

  const result: BackupResult = {
    success: true,
    path: backupPath,
    sizeBytes: stats.size,
    durationMs,
    verified,
    timestamp: new Date().toISOString(),
  };

  console.log(
    `💾 Backup created: ${filename} (${(stats.size / 1024 / 1024).toFixed(2)} MB, ${durationMs}ms, verified=${verified})`,
  );

  return result;
}

/**
 * Prune backups older than the retention window.
 * Only deletes files matching our naming pattern to avoid removing unrelated files.
 */
export function pruneBackups(targetDir?: string): PruneResult {
  const dir = targetDir ?? config.backup.dir;

  if (!existsSync(dir)) {
    return { removed: 0, remaining: 0, oldestKept: null };
  }

  const cutoff = Date.now() - config.backup.retentionDays * 24 * 60 * 60 * 1000;
  const files = readdirSync(dir)
    .filter((f) => f.startsWith(BACKUP_PREFIX) && f.endsWith(BACKUP_EXT))
    .map((f) => ({
      name: f,
      path: join(dir, f),
      mtime: statSync(join(dir, f)).mtimeMs,
    }))
    .sort((a, b) => a.mtime - b.mtime); // oldest first

  let removed = 0;
  for (const file of files) {
    if (file.mtime < cutoff) {
      try {
        unlinkSync(file.path);
        removed++;
      } catch (err) {
        console.error(`⚠️ Failed to prune backup ${file.name}:`, err);
      }
    }
  }

  const remaining = files.length - removed;
  const kept = files.filter((f) => f.mtime >= cutoff);
  const oldestKept = kept.length > 0 ? kept[0].name : null;

  if (removed > 0) {
    console.log(
      `🗑️ Pruned ${removed} old backup(s), ${remaining} remaining (oldest: ${oldestKept ?? "none"})`,
    );
  }

  return { removed, remaining, oldestKept };
}

/**
 * List all existing backups with metadata.
 */
export function listBackups(
  targetDir?: string,
): { name: string; sizeBytes: number; createdAt: string }[] {
  const dir = targetDir ?? config.backup.dir;

  if (!existsSync(dir)) return [];

  return readdirSync(dir)
    .filter((f) => f.startsWith(BACKUP_PREFIX) && f.endsWith(BACKUP_EXT))
    .map((f) => {
      const stats = statSync(join(dir, f));
      return {
        name: f,
        sizeBytes: stats.size,
        createdAt: stats.mtime.toISOString(),
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt)); // newest first
}

// ============================================================================
// SCHEDULER
// ============================================================================

/**
 * Start the automated backup scheduler.
 * Runs an immediate backup on start, then every `BACKUP_INTERVAL_HOURS`.
 */
export function startBackupScheduler(): void {
  if (!config.backup.enabled) {
    console.log("💾 Automated backups disabled (BACKUP_ENABLED=false)");
    return;
  }

  const intervalMs = config.backup.intervalHours * 60 * 60 * 1000;

  console.log(
    `💾 Backup scheduler started: every ${config.backup.intervalHours}h, retaining ${config.backup.retentionDays} days`,
  );

  // Run first backup after a short delay (let DB fully initialize)
  setTimeout(async () => {
    try {
      await createBackup();
      pruneBackups();
    } catch (err) {
      console.error("💾 Initial backup failed:", err);
    }
  }, 10_000); // 10 seconds after startup

  // Schedule recurring backups
  backupTimer = setInterval(async () => {
    try {
      await createBackup();
      pruneBackups();
    } catch (err) {
      console.error("💾 Scheduled backup failed:", err);
    }
  }, intervalMs);
}

/**
 * Stop the backup scheduler (for graceful shutdown).
 */
export function stopBackupScheduler(): void {
  if (backupTimer) {
    clearInterval(backupTimer);
    backupTimer = null;
    console.log("💾 Backup scheduler stopped");
  }
}
