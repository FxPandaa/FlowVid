/**
 * FlowVid API - Configuration Management
 * Simplified configuration for account sync backend
 */

import { config as dotenvConfig } from "dotenv";
import { resolve } from "path";

// Load .env file
dotenvConfig({ path: resolve(process.cwd(), ".env") });

function getEnvVar(key: string, defaultValue?: string): string {
  const value = process.env[key] ?? defaultValue;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function getEnvVarInt(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (value === undefined) return defaultValue;
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(`Environment variable ${key} must be a valid integer`);
  }
  return parsed;
}

export const config = {
  // Server Configuration
  server: {
    port: getEnvVarInt("PORT", 3000),
    host: getEnvVar(
      "BIND_HOST",
      // Default to 127.0.0.1 when tunnel is enabled (no direct exposure needed)
      getEnvVar("CLOUDFLARE_TUNNEL", "false") === "true" ? "127.0.0.1" : "0.0.0.0",
    ),
    nodeEnv: getEnvVar("NODE_ENV", "development"),
    isDevelopment: getEnvVar("NODE_ENV", "development") === "development",
    isProduction: getEnvVar("NODE_ENV", "development") === "production",
    /** When true, trust CF-Connecting-IP header and restrict /internal to loopback */
    cloudflareTunnel: getEnvVar("CLOUDFLARE_TUNNEL", "false") === "true",
  },

  // JWT Configuration
  jwt: {
    secret: getEnvVar(
      "JWT_SECRET",
      "FlowVid-dev-secret-change-in-production-32chars",
    ),
    expiresIn: getEnvVar("JWT_EXPIRES_IN", "7d"),
    refreshExpiresIn: getEnvVar("JWT_REFRESH_EXPIRES_IN", "30d"),
  },

  // Database Configuration
  database: {
    path: getEnvVar("DATABASE_PATH", "./data/FlowVid.db"),
  },

  // CORS Configuration
  cors: {
    origins: getEnvVar(
      "CORS_ORIGINS",
      "http://localhost:1420,http://localhost:3000,tauri://localhost",
    ).split(","),
  },

  // Rate Limiting
  rateLimit: {
    windowMs: getEnvVarInt("RATE_LIMIT_WINDOW_MS", 15 * 60 * 1000),
    maxRequests: getEnvVarInt("RATE_LIMIT_MAX_REQUESTS", 300),
  },

  // Cache TTL (seconds)
  cache: {
    metadataTtl: getEnvVarInt("METADATA_CACHE_TTL", 86400), // 24 hours
  },

  // Cinemeta Configuration (for metadata proxy)
  cinemeta: {
    baseUrl: "https://v3-cinemeta.strem.io",
  },

  // Dodo Payments Configuration (Merchant of Record — no KVK needed)
  dodo: {
    apiKey: getEnvVar("DODO_API_KEY", "placeholder"),
    webhookSecret: getEnvVar("DODO_WEBHOOK_SECRET", "placeholder"),
    productId: getEnvVar("DODO_PRODUCT_ID", "placeholder"),
    successUrl: getEnvVar(
      "DODO_SUCCESS_URL",
      "http://localhost:1420/settings?payment=success",
    ),
    cancelUrl: getEnvVar(
      "DODO_CANCEL_URL",
      "http://localhost:1420/settings?payment=canceled",
    ),
  },

  // TorBox Vendor Configuration
  torbox: {
    vendorApiKey: getEnvVar("TORBOX_VENDOR_API_KEY", ""),
    encryptionKey: getEnvVar(
      "TORBOX_ENCRYPTION_KEY",
      "FlowVid-dev-encryption-key-change-in-prod",
    ),
  },

  // Internal/Operator API
  internal: {
    apiKey: getEnvVar("INTERNAL_API_KEY", ""),
  },

  // Backup Configuration
  backup: {
    enabled: getEnvVar("BACKUP_ENABLED", "true") === "true",
    dir: getEnvVar("BACKUP_DIR", "./data/backups"),
    intervalHours: getEnvVarInt("BACKUP_INTERVAL_HOURS", 6),
    retentionDays: getEnvVarInt("BACKUP_RETENTION_DAYS", 30),
  },

  // Static Website Directory (leave empty to disable)
  website: {
    dir: getEnvVar("WEBSITE_DIR", ""),
  },

  // App Version & Update Config
  updates: {
    appVersion: getEnvVar("APP_VERSION", "1.0.0"),
    minAppVersion: getEnvVar("MIN_APP_VERSION", "1.0.0"),
    updateNotes: getEnvVar("UPDATE_NOTES", ""),
    /** Base URL where Tauri update bundles are hosted (e.g. https://releases.flowvid.com) */
    tauriUpdateUrl: getEnvVar("TAURI_UPDATE_URL", ""),
    /** Local directory containing .sig files for Tauri update verification */
    signatureDir: getEnvVar("TAURI_SIGNATURE_DIR", ""),
  },
} as const;

// Known dev-only placeholder values that MUST be overridden in production
const DEV_PLACEHOLDERS = [
  "FlowVid-dev-secret-change-in-production-32chars",
  "FlowVid-dev-encryption-key-change-in-prod",
];

// Validate critical configuration on startup
export function validateConfig(): void {
  const errors: string[] = [];

  // JWT secret must be strong and NOT the dev placeholder in production
  if (config.server.isProduction) {
    if (config.jwt.secret.length < 32) {
      errors.push("JWT_SECRET must be at least 32 characters in production");
    }
    if (DEV_PLACEHOLDERS.includes(config.jwt.secret)) {
      errors.push(
        "JWT_SECRET is still the dev placeholder — set a unique secret in production",
      );
    }
  }

  // Encryption key must be strong and NOT the dev placeholder in production
  if (config.server.isProduction) {
    if (config.torbox.encryptionKey.length < 32) {
      errors.push(
        "TORBOX_ENCRYPTION_KEY must be at least 32 characters in production",
      );
    }
    if (DEV_PLACEHOLDERS.includes(config.torbox.encryptionKey)) {
      errors.push(
        "TORBOX_ENCRYPTION_KEY is still the dev placeholder — set a unique key in production",
      );
    }
  }

  // Dodo Payments should be configured in production
  if (config.server.isProduction) {
    if (config.dodo.apiKey === "placeholder") {
      errors.push("DODO_API_KEY must be set in production");
    }
    if (config.dodo.webhookSecret === "placeholder") {
      errors.push("DODO_WEBHOOK_SECRET must be set in production");
    }
  }

  // Internal API key must be set in production
  if (config.server.isProduction && !config.internal.apiKey) {
    errors.push(
      "INTERNAL_API_KEY must be set in production (protects /internal/* operator routes)",
    );
  }

  if (errors.length > 0) {
    console.error("Configuration errors:");
    errors.forEach((e) => console.error(`  - ${e}`));
    throw new Error("Invalid configuration");
  }
}

export default config;
