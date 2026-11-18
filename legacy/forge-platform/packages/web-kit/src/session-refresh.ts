/**
 * Single-flight Cognito access-token refresh for browser sessions.
 * Concurrent callers share one refresh so a burst of 401s cannot thrash Cognito
 * or wipe the session via overlapping failures.
 *
 * Refresh uses the HttpOnly session cookie (+ optional CSRF) — not a JS refresh token.
 *
 * Important: the shared flight must NOT take a caller AbortSignal. Bootstrap timeouts
 * and unmounted request signals were aborting refresh for every waiter, which then
 * tripped onUnauthorized and looked like random logout.
 */

import { isAccessTokenExpiredOrNearExpiry } from "./access-token.js";
import { getBearerToken, isLogoutPending } from "./auth-storage.js";
import { refreshAccessToken } from "./cognito-oauth.js";

let inFlight: Promise<boolean> | null = null;

export type TryRefreshSessionOptions = {
  signal?: AbortSignal;
  /** Always hit the session refresh endpoint (e.g. after an API 401), even if the JWT looks fresh. */
  force?: boolean;
};

function hasUsableBearer(skewSeconds = 0): boolean {
  const bearer = getBearerToken();
  return Boolean(bearer) && !isAccessTokenExpiredOrNearExpiry(bearer, skewSeconds);
}

/**
 * Refresh the access token when near expiry (or when `force` is set).
 * Returns true when a usable bearer is available afterward.
 */
export async function tryRefreshSession(options?: TryRefreshSessionOptions): Promise<boolean> {
  if (isLogoutPending()) {
    return false;
  }

  // Caller already aborted — do not start/join work that would be discarded, unless
  // another refresh is already in flight (share that result).
  if (options?.signal?.aborted && !inFlight) {
    return hasUsableBearer(0);
  }

  const needsRefresh =
    Boolean(options?.force) ||
    !getBearerToken() ||
    isAccessTokenExpiredOrNearExpiry(getBearerToken());
  if (!needsRefresh) {
    return Boolean(getBearerToken());
  }

  if (inFlight) {
    return inFlight;
  }

  inFlight = (async () => {
    try {
      // Intentionally no AbortSignal — shared flight must outlive any one caller.
      const result = await refreshAccessToken();
      if (result?.access_token) return true;
      // Definitive rejection from /session/refresh (401/403 → null).
      return hasUsableBearer(0);
    } catch {
      // Network / parse blips must not force logout while a bearer still exists.
      return hasUsableBearer(0) || Boolean(getBearerToken());
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}
