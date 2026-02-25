/**
 * FlowVid API - Encryption Utilities
 * AES-256-GCM encryption for TorBox API tokens at rest
 */

import crypto from "crypto";
import config from "../config/index.js";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

/** Cached derived key — PBKDF2 is deterministic for a given config, so derive once */
let _cachedKey: Buffer | null = null;

/**
 * Derive a 256-bit key from the configured encryption secret
 */
function deriveKey(): Buffer {
  if (_cachedKey) return _cachedKey;
  const secret = config.torbox.encryptionKey;
  _cachedKey = crypto.pbkdf2Sync(
    secret,
    "FlowVid-torbox-token-encryption",
    100_000,
    32,
    "sha256",
  );
  return _cachedKey;
}

/**
 * Encrypt a plaintext string (e.g. TorBox API token)
 * Returns: base64-encoded string of iv + authTag + ciphertext
 */
export function encrypt(plaintext: string): string {
  const key = deriveKey();
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // Pack: iv (16) + authTag (16) + ciphertext (variable)
  const packed = Buffer.concat([iv, authTag, encrypted]);
  return packed.toString("base64");
}

/**
 * Decrypt a base64-encoded encrypted string back to plaintext
 */
export function decrypt(encryptedBase64: string): string {
  const key = deriveKey();
  const packed = Buffer.from(encryptedBase64, "base64");

  if (packed.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) {
    throw new Error("Invalid encrypted data: too short");
  }

  const iv = packed.subarray(0, IV_LENGTH);
  const authTag = packed.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = packed.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}
