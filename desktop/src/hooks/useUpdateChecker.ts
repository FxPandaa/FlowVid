/**
 * useUpdateChecker — Hook for checking app updates from the FlowVid API.
 *
 * For Tauri desktop: The `tauri-plugin-updater` with `dialog: true` already
 * handles automatic update prompts on startup. This hook provides a manual
 * "Check for Updates" button in Settings.
 *
 * For mobile/TV: Uses the generic /updates/check endpoint to detect new
 * versions and show a store link or force-update notice.
 */

import { useState, useCallback } from "react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";
const APP_VERSION = import.meta.env.VITE_APP_VERSION || "1.0.0";

export interface UpdateCheckResult {
  currentVersion: string;
  latestVersion: string;
  hasUpdate: boolean;
  forceUpdate: boolean;
  notes: string | null;
  storeUrl: string | null;
}

export function useUpdateChecker() {
  const [isChecking, setIsChecking] = useState(false);
  const [result, setResult] = useState<UpdateCheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const checkForUpdates = useCallback(async () => {
    setIsChecking(true);
    setError(null);
    setResult(null);

    try {
      // Detect platform
      const platform = detectPlatform();

      const response = await fetch(
        `${API_URL}/updates/check?platform=${platform}&version=${APP_VERSION}`,
      );

      if (!response.ok) {
        throw new Error("Failed to check for updates");
      }

      const data = await response.json();
      const updateResult: UpdateCheckResult = {
        currentVersion: APP_VERSION,
        latestVersion: data.data.latestVersion,
        hasUpdate: data.data.hasUpdate,
        forceUpdate: data.data.forceUpdate,
        notes: data.data.notes,
        storeUrl: data.data.storeUrl,
      };

      setResult(updateResult);
      return updateResult;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Update check failed";
      setError(message);
      return null;
    } finally {
      setIsChecking(false);
    }
  }, []);

  return {
    checkForUpdates,
    isChecking,
    result,
    error,
    currentVersion: APP_VERSION,
  };
}

function detectPlatform(): string {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("windows")) return "windows";
  if (ua.includes("mac")) return "macos";
  if (ua.includes("linux")) return "linux";
  if (ua.includes("android")) {
    // Android TV has "TV" in user agent or uses Leanback
    if (ua.includes("tv") || ua.includes("leanback")) return "android-tv";
    return "android";
  }
  if (ua.includes("iphone") || ua.includes("ipad")) return "ios";
  return "unknown";
}
