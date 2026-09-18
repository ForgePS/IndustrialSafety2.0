import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const KEY_ENV = "FORGE_AUTH_SESSION_ENCRYPTION_KEY";
const DEV_KEY_MATERIAL = "forge-insecure-dev-auth-session-key-v1";

let warnedMissingKey = false;

export type EncryptedRefreshToken = {
  ciphertextBase64: string;
  nonceBase64: string;
};

function decodeKeyMaterial(raw: string): Buffer | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const buf = Buffer.from(trimmed, "base64");
    return buf.length === 32 ? buf : null;
  } catch {
    return null;
  }
}

/**
 * Resolve AES-256 key. Production-like environments must set FORGE_AUTH_SESSION_ENCRYPTION_KEY
 * (base64 of 32 bytes). Local/testing may fall back to a deterministic insecure key.
 */
export function resolveAuthSessionEncryptionKey(appEnv: string, envValue?: string): Buffer {
  const fromEnv = decodeKeyMaterial(envValue ?? process.env[KEY_ENV] ?? "");
  if (fromEnv) return fromEnv;

  const allowInsecure = appEnv === "local" || appEnv === "testing";
  if (!allowInsecure) {
    throw new Error(
      `${KEY_ENV} must be set to a base64-encoded 32-byte key outside local/testing`,
    );
  }

  if (!warnedMissingKey) {
    warnedMissingKey = true;
    console.warn(
      `[auth-session] ${KEY_ENV} is unset; using an insecure deterministic key. Production must set ${KEY_ENV}.`,
    );
  }

  return createHash("sha256").update(DEV_KEY_MATERIAL, "utf8").digest();
}

/** Reset the one-shot missing-key warning (tests only). */
export function resetAuthSessionCryptoWarningForTests(): void {
  warnedMissingKey = false;
}

export function encryptRefreshToken(plaintext: string, key: Buffer): EncryptedRefreshToken {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertextBase64: Buffer.concat([ciphertext, tag]).toString("base64"),
    nonceBase64: nonce.toString("base64"),
  };
}

export function decryptRefreshToken(
  encrypted: EncryptedRefreshToken,
  key: Buffer,
): string {
  const blob = Buffer.from(encrypted.ciphertextBase64, "base64");
  if (blob.length < 17) {
    throw new Error("Invalid refresh token ciphertext");
  }
  const ciphertext = blob.subarray(0, blob.length - 16);
  const tag = blob.subarray(blob.length - 16);
  const nonce = Buffer.from(encrypted.nonceBase64, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, nonce);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

/** Redact secrets from log-bound objects (never logs plaintext refresh tokens). */
export function redactAuthSessionSecrets<T extends Record<string, unknown>>(value: T): T {
  const out: Record<string, unknown> = { ...value };
  for (const key of Object.keys(out)) {
    const lower = key.toLowerCase();
    if (
      lower.includes("refresh") ||
      lower.includes("password") ||
      lower.includes("secret") ||
      lower.includes("ciphertext") ||
      lower === "authorization"
    ) {
      out[key] = "[redacted]";
    }
  }
  return out as T;
}
