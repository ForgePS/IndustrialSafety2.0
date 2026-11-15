/**
 * Strict Cognito access-token shape checks for browser storage.
 * JWKS documents and other non-JWT payloads must never become Authorization bearers.
 */

export class InvalidAccessTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidAccessTokenError";
  }
}

/** Compact JWT form: header.payload.signature (three base64url segments). */
const COMPACT_JWT = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

function looksLikeJwksDocument(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed.startsWith("{")) return false;
  try {
    const parsed = JSON.parse(trimmed) as { keys?: unknown };
    return Array.isArray(parsed.keys);
  } catch {
    return false;
  }
}

/**
 * Asserts `token` is a compact JWT suitable as a Cognito access_token.
 * Rejects JWKS JSON, ID/refresh token blobs stored as objects, and empty values.
 */
export function assertAccessTokenShape(token: string): string {
  const trimmed = token.trim();
  if (!trimmed) {
    throw new InvalidAccessTokenError("Access token is empty");
  }
  if (looksLikeJwksDocument(trimmed)) {
    throw new InvalidAccessTokenError(
      "Refusing to store a JWKS document as an access token. Use the Cognito access_token JWT only.",
    );
  }
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    throw new InvalidAccessTokenError(
      "Refusing to store JSON as an access token. Use the Cognito access_token JWT only.",
    );
  }
  if (!COMPACT_JWT.test(trimmed)) {
    throw new InvalidAccessTokenError(
      "Access token must be a compact JWT (three base64url segments). JWKS and other payloads are not valid Authorization bearers.",
    );
  }
  return trimmed;
}

/**
 * Absolute expiry time (ms since epoch) from the JWT `exp` claim, or null when
 * the token is missing / not a readable compact JWT.
 */
export function getAccessTokenExpiresAtMs(token: string | null | undefined): number | null {
  if (!token?.trim()) return null;
  const parts = token.trim().split(".");
  if (parts.length !== 3) return null;
  try {
    const payloadJson = atob(parts[1]!.replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(payloadJson) as { exp?: unknown };
    const exp = typeof payload.exp === "number" ? payload.exp : Number(payload.exp);
    if (!Number.isFinite(exp)) return null;
    return exp * 1000;
  } catch {
    return null;
  }
}

/**
 * True when the compact JWT `exp` claim is missing, unreadable, or within
 * `skewSeconds` of expiry (default 60s). Non-JWT values are treated as expired.
 */
export function isAccessTokenExpiredOrNearExpiry(
  token: string | null | undefined,
  skewSeconds = 60,
  nowMs = Date.now(),
): boolean {
  const expiresAt = getAccessTokenExpiresAtMs(token);
  if (expiresAt == null) return true;
  return expiresAt <= nowMs + skewSeconds * 1000;
}

/**
 * Milliseconds until the token is considered near-expiry. Returns 0 when already
 * near/expired, or null when expiry cannot be read.
 */
export function msUntilAccessTokenNearExpiry(
  token: string | null | undefined,
  skewSeconds = 60,
  nowMs = Date.now(),
): number | null {
  const expiresAt = getAccessTokenExpiresAtMs(token);
  if (expiresAt == null) return null;
  return Math.max(0, expiresAt - skewSeconds * 1000 - nowMs);
}
