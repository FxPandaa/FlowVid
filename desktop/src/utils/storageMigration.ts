/**
 * One-time localStorage migration from "streamio-*" keys to "FlowVid-*" keys.
 * Preserves existing user data (auth, profiles, library, settings) on app rename.
 * Safe to run multiple times — only migrates if old key exists and new key does not.
 */

const MIGRATION_MAP: Record<string, string> = {
  "streamio-auth": "FlowVid-auth",
  "streamio-profiles": "FlowVid-profiles",
  "streamio-library": "FlowVid-library",
  "streamio-settings": "FlowVid-settings",
};

export function migrateLocalStorage(): void {
  let migrated = 0;

  for (const [oldKey, newKey] of Object.entries(MIGRATION_MAP)) {
    const oldData = localStorage.getItem(oldKey);
    const newData = localStorage.getItem(newKey);

    // Only migrate if old key exists and new key hasn't been written yet
    if (oldData !== null && newData === null) {
      localStorage.setItem(newKey, oldData);
      localStorage.removeItem(oldKey);
      migrated++;
    }
  }

  if (migrated > 0) {
    console.log(
      `[Migration] Migrated ${migrated} localStorage key(s) from streamio → FlowVid`,
    );
  }
}
