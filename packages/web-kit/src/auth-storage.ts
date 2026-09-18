import { assertAccessTokenShape } from "./access-token.js";

const DEV_PRINCIPAL_KEY = "forge-dev-principal";
const BEARER_TOKEN_KEY = "forge-bearer-token";
const REFRESH_TOKEN_KEY = "forge-refresh-token";
/** Last tenant chosen via select-tenant — memory only (FIS-H01). */
const ACTIVE_TENANT_KEY = "forge-active-tenant-id";
/**
 * Last successful /auth/me payload for the current access token.
 * Used to avoid login-gate "Loading…" flashes on static-export full remounts.
 */
const AUTH_ME_CACHE_KEY = "forge-auth-me-cache";

/** Credential keys that must never be read from web storage (FIS-H01). */
const LEGACY_AUTH_KEYS = [BEARER_TOKEN_KEY, REFRESH_TOKEN_KEY, ACTIVE_TENANT_KEY] as const;

export type DevPrincipal = {
  userId: string;
  tenantId: string;
};

type AuthMeCacheEnvelope = {
  tokenFingerprint: string;
  me: unknown;
};

let memoryBearerToken: string | null = null;
let memoryActiveTenantId: string | null = null;
let memoryCsrfToken: string | null = null;

function tokenFingerprint(token: string): string {
  return `${token.length}:${token.slice(0, 16)}:${token.slice(-12)}`;
}

/**
 * Remove legacy credential keys from localStorage. Never getItem/setItem those keys.
 */
export function purgeLegacyAuthKeys(): void {
  if (typeof window === "undefined") return;
  try {
    for (const key of LEGACY_AUTH_KEYS) {
      localStorage.removeItem(key);
    }
  } catch {
    // ignore quota / private mode
  }
}

if (typeof window !== "undefined") {
  purgeLegacyAuthKeys();
}

export function getDevPrincipal(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(DEV_PRINCIPAL_KEY);
}

export function setDevPrincipal(value: DevPrincipal): void {
  localStorage.setItem(DEV_PRINCIPAL_KEY, JSON.stringify(value));
}

export function clearDevPrincipal(): void {
  localStorage.removeItem(DEV_PRINCIPAL_KEY);
}

export function getBearerToken(): string | null {
  if (typeof window === "undefined") return null;
  return memoryBearerToken;
}

/**
 * Store a Cognito access_token in module memory only. JWKS documents and non-JWT payloads are rejected.
 */
export function setBearerToken(token: string): void {
  memoryBearerToken = assertAccessTokenShape(token);
}

export function clearBearerToken(): void {
  memoryBearerToken = null;
  if (typeof window !== "undefined") {
    try {
      localStorage.removeItem(BEARER_TOKEN_KEY);
    } catch {
      // ignore
    }
  }
}

/** Always null — refresh tokens are HttpOnly / server-side only (FIS-H01). */
export function getRefreshToken(): string | null {
  return null;
}

/** No-op — refresh tokens must not enter JS-readable storage. */
export function setRefreshToken(_token: string): void {
  // intentionally empty
}

export function clearRefreshToken(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  } catch {
    // ignore
  }
}

export function getCsrfToken(): string | null {
  return memoryCsrfToken;
}

export function setCsrfToken(token: string): void {
  memoryCsrfToken = token;
}

export function clearCsrfToken(): void {
  memoryCsrfToken = null;
}

export function getActiveTenantId(): string | null {
  if (typeof window === "undefined") return null;
  return memoryActiveTenantId;
}

export function setActiveTenantId(tenantId: string): void {
  memoryActiveTenantId = tenantId;
}

export function clearActiveTenantId(): void {
  memoryActiveTenantId = null;
  if (typeof window !== "undefined") {
    try {
      localStorage.removeItem(ACTIVE_TENANT_KEY);
    } catch {
      // ignore
    }
  }
}

/** Return cached /auth/me when it matches the current bearer token. */
export function getCachedAuthMe<T = unknown>(): T | null {
  if (typeof window === "undefined") return null;
  const token = getBearerToken();
  if (!token) return null;
  try {
    const raw = sessionStorage.getItem(AUTH_ME_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AuthMeCacheEnvelope>;
    if (!parsed || parsed.tokenFingerprint !== tokenFingerprint(token) || !parsed.me) {
      return null;
    }
    return parsed.me as T;
  } catch {
    return null;
  }
}

export function setCachedAuthMe(me: unknown): void {
  if (typeof window === "undefined") return;
  const token = getBearerToken();
  if (!token || !me || typeof me !== "object") return;
  try {
    const envelope: AuthMeCacheEnvelope = {
      tokenFingerprint: tokenFingerprint(token),
      me,
    };
    sessionStorage.setItem(AUTH_ME_CACHE_KEY, JSON.stringify(envelope));
  } catch {
    // ignore quota / private mode
  }
}

export function clearCachedAuthMe(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(AUTH_ME_CACHE_KEY);
  } catch {
    // ignore
  }
}

export function clearAuthStorage(): void {
  memoryBearerToken = null;
  memoryActiveTenantId = null;
  memoryCsrfToken = null;
  clearDevPrincipal();
  purgeLegacyAuthKeys();
  clearCachedAuthMe();
}

export function parseDevPrincipal(raw: string): DevPrincipal | null {
  try {
    const parsed = JSON.parse(raw) as Partial<DevPrincipal>;
    if (parsed.userId && parsed.tenantId) {
      return { userId: parsed.userId, tenantId: parsed.tenantId };
    }
    return null;
  } catch {
    return null;
  }
}
