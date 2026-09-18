/**
 * Single-flight Cognito access-token refresh for browser sessions.
 * Concurrent callers share one refresh so a burst of 401s cannot thrash Cognito
 * or wipe the session via overlapping failures.
 *
 * Refresh uses the HttpOnly session cookie + CSRF (FIS-H01) — not a JS refresh token.
 */

import { isAccessTokenExpiredOrNearExpiry } from "./access-token.js";
import { getBearerToken } from "./auth-storage.js";
import { refreshAccessToken } from "./cognito-oauth.js";

let inFlight: Promise<boolean> | null = null;

export type TryRefreshSessionOptions = {
  signal?: AbortSignal;
  /** Always hit the session refresh endpoint (e.g. after an API 401), even if the JWT looks fresh. */
  force?: boolean;
};

/**
 * Refresh the access token when near expiry (or when `force` is set).
 * Returns true when a usable bearer is available afterward.
 */
export async function tryRefreshSession(options?: TryRefreshSessionOptions): Promise<boolean> {
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
      const result = await refreshAccessToken(
        options?.signal ? { signal: options.signal } : undefined,
      );
      if (result?.access_token) return true;
      return Boolean(getBearerToken()) && !isAccessTokenExpiredOrNearExpiry(getBearerToken(), 0);
    } catch {
      return false;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}
