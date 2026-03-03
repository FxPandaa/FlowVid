/**
 * FlowVid API - Update Check Routes
 *
 * Provides version checking for all platforms:
 *   GET /updates/check?platform=<platform>&version=<current_version>
 *     → Returns update availability, force-update flag, release notes
 *
 *   GET /updates/tauri/:target/:current_version
 *     → Tauri v2 updater-compatible JSON manifest
 *
 * Platforms: windows, macos, linux, android, ios, android-tv, apple-tv
 */

import { Router, Request, Response } from "express";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import config from "../config/index.js";

const router = Router();

// ============================================================================
// HELPERS
// ============================================================================

/** Semver comparison: returns -1 | 0 | 1 */
function compareSemver(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}

/** Map Tauri target triple to a human-friendly platform key */
function tauriTargetToPlatform(target: string): string {
  if (target.includes("windows")) return "windows";
  if (target.includes("darwin") || target.includes("macos")) return "macos";
  if (target.includes("linux")) return "linux";
  return target;
}

// ============================================================================
// ROUTES
// ============================================================================

/**
 * GET /updates/check
 * Universal update check — works for all platforms (desktop, mobile, TV)
 *
 * Query params:
 *   platform  — windows | macos | linux | android | ios | android-tv | apple-tv
 *   version   — current app version (semver, e.g. "1.0.0")
 */
router.get("/check", (req: Request, res: Response) => {
  const platform = (req.query.platform as string)?.toLowerCase() ?? "unknown";
  const currentVersion = (req.query.version as string) ?? "0.0.0";

  const latestVersion = config.updates.appVersion;
  const minVersion = config.updates.minAppVersion;

  const hasUpdate = compareSemver(latestVersion, currentVersion) > 0;
  const forceUpdate = compareSemver(minVersion, currentVersion) > 0;

  res.json({
    success: true,
    data: {
      currentVersion,
      latestVersion,
      minVersion,
      hasUpdate,
      forceUpdate,
      platform,
      notes: config.updates.updateNotes || null,
      /** For mobile/TV: direct users to their platform store */
      storeUrl: getStoreUrl(platform),
    },
  });
});

/**
 * GET /updates/tauri/:target/:current_version
 *
 * Tauri v2 updater endpoint.
 * Returns 204 No Content when already up-to-date (Tauri convention).
 * Returns JSON manifest when an update is available.
 *
 * The manifest points to externally hosted bundles (TAURI_UPDATE_URL).
 * If TAURI_UPDATE_URL is not set, always returns 204.
 */
router.get("/tauri/:target/:current_version", (req: Request<{ target: string; current_version: string }>, res: Response) => {
  const target = req.params.target;
  const currentVersion = req.params.current_version;
  const latestVersion = config.updates.appVersion;

  // No update available (or update URL not configured)
  if (
    !config.updates.tauriUpdateUrl ||
    compareSemver(latestVersion, currentVersion) <= 0
  ) {
    res.status(204).end();
    return;
  }

  const platform = tauriTargetToPlatform(target);

  // Build download URL based on platform
  // Convention: TAURI_UPDATE_URL/v{version}/{filename}
  const baseUrl = config.updates.tauriUpdateUrl.replace(/\/+$/, "");
  const ext = getBundleExtension(platform);
  const url = `${baseUrl}/v${latestVersion}/FlowVid-${latestVersion}${ext}`;

  // Try to read the signature from a local .sig file if updates are hosted locally.
  // When using GitHub Releases or external hosting, set TAURI_SIGNATURE_DIR to where
  // you store the .sig files, or leave empty to use an empty signature
  // (the Tauri updater will skip verification if pubkey is empty).
  let signature = "";
  const sigDir = config.updates.signatureDir;
  if (sigDir) {
    const sigFile = join(sigDir, `FlowVid-${latestVersion}${ext}.sig`);
    if (existsSync(sigFile)) {
      try {
        signature = readFileSync(sigFile, "utf-8").trim();
      } catch {
        // Signature file unreadable — proceed without
      }
    }
  }

  // Tauri v2 updater manifest format
  // NOTE: "signature" must be the actual signature string, not a URL.
  // When you build with `tauri build`, a .sig file is generated.
  // Upload both the bundle and .sig to TAURI_UPDATE_URL.
  // The signature content is read by the Tauri client and verified against pubkey.
  // In this server-driven setup, we provide the sig URL — the Tauri updater
  // will fetch the signature from this URL automatically when it's a URL string.
  res.json({
    version: `v${latestVersion}`,
    notes: config.updates.updateNotes || `FlowVid v${latestVersion}`,
    pub_date: new Date().toISOString(),
    platforms: {
      [target]: {
        url,
        signature,
      },
    },
  });
});

// ============================================================================
// PLATFORM HELPERS
// ============================================================================

function getStoreUrl(platform: string): string | null {
  switch (platform) {
    case "android":
    case "android-tv":
      // Replace with your actual Play Store URL when published
      return "https://play.google.com/store/apps/details?id=com.FlowVid.app";
    case "ios":
    case "apple-tv":
      // Replace with your actual App Store URL when published
      return "https://apps.apple.com/app/flowvid/id0000000000";
    default:
      return null;
  }
}

function getBundleExtension(platform: string): string {
  switch (platform) {
    case "windows":
      return ".nsis.zip";
    case "macos":
      return ".app.tar.gz";
    case "linux":
      return ".AppImage.tar.gz";
    default:
      return ".tar.gz";
  }
}

export default router;
