"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { flushSync } from "react-dom";
import {
  EXECUTIVE_WALKTHROUGH_SESSION_EVENT,
  EXECUTIVE_WALKTHROUGH_SESSION_KEY,
  INDUSTRIAL_MODULE_PAGE_PERMISSIONS,
  INDUSTRIAL_MODULE_REGISTRY,
  INDUSTRIAL_PERMISSIONS,
} from "@forge/contracts";
import { configureApiClient } from "./api-client.js";
import { authMe, logoutAll, selectTenant, type AuthMe } from "./auth-api.js";
import {
  isAccessTokenExpiredOrNearExpiry,
  msUntilAccessTokenNearExpiry,
} from "./access-token.js";
import {
  clearActiveTenantId,
  clearAuthStorage,
  getActiveTenantId,
  getBearerToken,
  getCachedAuthMe,
  setActiveTenantId,
  setCachedAuthMe,
  clearCachedAuthMe,
} from "./auth-storage.js";
import { buildLogoutUrl, redirectToCognitoLogin, refreshAccessToken } from "./cognito-oauth.js";
import {
  authenticateWithPassword,
  completeMfaChallenge,
  completeNewPasswordChallenge,
  type CognitoPasswordChallenge,
} from "./cognito-password-auth.js";
import { tryRefreshSession } from "./session-refresh.js";
import { switchActiveTenant } from "./tenant-switch.js";
import { syncTenantIdInUrl } from "./tenant-scoped.js";
import { runForgeBrowserCleanup } from "./forge-browser-cleanup.js";
import {
  applyRolePreviewToMe,
  clearRolePreview,
  readRolePreview,
  writeRolePreview,
  type RolePreviewState,
} from "./role-preview.js";

/** Max time for initial session bootstrap before surfacing a recoverable error. */
export const AUTH_BOOTSTRAP_TIMEOUT_MS = 25_000;

const DEMO_WALKTHROUGH_PERMISSIONS: readonly string[] = [
  ...INDUSTRIAL_PERMISSIONS,
  ...INDUSTRIAL_MODULE_PAGE_PERMISSIONS,
];

const DEMO_WALKTHROUGH_MODULES: readonly string[] = INDUSTRIAL_MODULE_REGISTRY.map(
  (row) => row.code,
);

function readWalkthroughDemoActive(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = sessionStorage.getItem(EXECUTIVE_WALKTHROUGH_SESSION_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { active?: boolean };
    return Boolean(parsed?.active);
  } catch {
    return false;
  }
}

function withWalkthroughDemoAccess(me: AuthMe): AuthMe {
  return {
    ...me,
    permissions: Array.from(new Set([...me.permissions, ...DEMO_WALKTHROUGH_PERMISSIONS])),
    activeModules: Array.from(
      new Set([...(me.activeModules ?? []), ...DEMO_WALKTHROUGH_MODULES]),
    ),
  };
}

/** Refresh this many seconds before access-token exp (matches near-expiry skew). */
const PROACTIVE_REFRESH_SKEW_SECONDS = 90;
/** Minimum delay between proactive refresh attempts. */
const PROACTIVE_REFRESH_MIN_DELAY_MS = 5_000;
/** Cap so a bad/missing exp still re-checks periodically (~45 min). */
const PROACTIVE_REFRESH_MAX_DELAY_MS = 45 * 60_000;

export type AuthContextValue = {
  me: AuthMe | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  loginWithCognito: () => Promise<void>;
  /** In-app email/password via Cognito USER_PASSWORD_AUTH. Throws CognitoPasswordChallengeError for MFA / new password. */
  loginWithPassword: (username: string, password: string) => Promise<void>;
  completeNewPassword: (challenge: Extract<CognitoPasswordChallenge, { kind: "new_password_required" }>, newPassword: string) => Promise<void>;
  completeMfa: (challenge: Extract<CognitoPasswordChallenge, { kind: "mfa_required" }>, code: string) => Promise<void>;
  logout: () => Promise<void>;
  chooseTenant: (tenantId: string) => Promise<void>;
  signOutAll: () => Promise<void>;
  hasPermission: (code: string) => boolean;
  hasAnyPermission: (codes: string[]) => boolean;
  hasAllPermissions: (codes: string[]) => boolean;
  hasProduct: (productCode: string) => boolean;
  hasModule: (moduleCode: string) => boolean;
  /** Client-only Creator overlay: UI gates match this role; API auth is unchanged. */
  rolePreview: RolePreviewState | null;
  startRolePreview: (state: RolePreviewState) => void;
  exitRolePreview: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function statusOf(err: unknown): number {
  return err && typeof err === "object" && "status" in err ? Number(err.status) : 0;
}

function isAbortError(err: unknown): boolean {
  return (
    (err instanceof DOMException && err.name === "AbortError") ||
    (err instanceof Error && err.name === "AbortError")
  );
}

/**
 * Restore Cognito active-tenant context. Cognito identity home tenant is not
 * sticky across requests unless clients send x-tenant-id (via getActiveTenantId).
 */
export async function resolveSession(signal?: AbortSignal): Promise<AuthMe> {
  const persisted = getActiveTenantId();
  try {
    let me = await authMe(signal ? { signal } : undefined);
    if (
      persisted &&
      me.tenantId !== persisted &&
      me.tenants.some((t) => t.tenantId === persisted && t.selectable)
    ) {
      me = await selectTenant(persisted, signal ? { signal } : undefined);
    } else if (
      persisted &&
      !me.tenants.some((t) => t.tenantId === persisted && t.selectable)
    ) {
      clearActiveTenantId();
      me = await authMe(signal ? { signal } : undefined);
    }
    return me;
  } catch (err) {
    // Never retry after 401 — expired/missing tokens must settle as unauthenticated.
    // Never retry after abort — bootstrap timeout owns the error surface.
    if (persisted && statusOf(err) !== 401 && !isAbortError(err)) {
      clearActiveTenantId();
      return authMe(signal ? { signal } : undefined);
    }
    throw err;
  }
}

/**
 * Establish a session from stored tokens.
 * Prefer the existing access token for /auth/me; only hit Cognito refresh when
 * the JWT is missing/near expiry, or after a 401 from /auth/me.
 */
export async function establishSession(signal?: AbortSignal): Promise<AuthMe> {
  const bearer = getBearerToken();
  const needsRefresh = isAccessTokenExpiredOrNearExpiry(bearer);

  if (needsRefresh) {
    try {
      await refreshAccessToken(signal ? { signal } : undefined);
    } catch (err) {
      if (isAbortError(err)) throw err;
      // Fall through — an existing bearer may still work.
    }
  }

  try {
    return await resolveSession(signal);
  } catch (err) {
    if (statusOf(err) !== 401 || isAbortError(err)) {
      throw err;
    }
    try {
      await refreshAccessToken(signal ? { signal } : undefined);
    } catch (refreshErr) {
      if (isAbortError(refreshErr)) throw refreshErr;
      throw err;
    }
    return resolveSession(signal);
  }
}

function bootstrapErrorMessage(err: unknown): string {
  if (isAbortError(err)) {
    return "Session check timed out. Check your connection and try again.";
  }
  return err instanceof Error ? err.message : "Authentication failed";
}

function isAuthMeShape(value: unknown): value is AuthMe {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<AuthMe>;
  return typeof row.userId === "string" && Array.isArray(row.tenants) && Array.isArray(row.permissions);
}

function readInitialAuthMe(): AuthMe | null {
  const cached = getCachedAuthMe<unknown>();
  return isAuthMeShape(cached) ? cached : null;
}

/** Local walkthrough MP4 capture only (NEXT_PUBLIC_WALKTHROUGH_CAPTURE=true). */
function readWalkthroughCaptureMe(): AuthMe | null {
  if (typeof window === "undefined") return null;
  if (process.env.NEXT_PUBLIC_WALKTHROUGH_CAPTURE !== "true") return null;
  try {
    if (sessionStorage.getItem("forge-walkthrough-capture") !== "1") return null;
    const raw = sessionStorage.getItem("forge-walkthrough-capture-me");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return isAuthMeShape(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isWalkthroughCaptureSession(): boolean {
  if (typeof window === "undefined") return false;
  if (process.env.NEXT_PUBLIC_WALKTHROUGH_CAPTURE !== "true") return false;
  try {
    return sessionStorage.getItem("forge-walkthrough-capture") === "1";
  } catch {
    return false;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [sessionMe, setMe] = useState<AuthMe | null>(
    () => readWalkthroughCaptureMe() ?? readInitialAuthMe(),
  );
  const [rolePreview, setRolePreview] = useState<RolePreviewState | null>(() => readRolePreview());
  const [walkthroughDemoActive, setWalkthroughDemoActive] = useState(() =>
    readWalkthroughDemoActive(),
  );
  const [loading, setLoading] = useState(() => !readWalkthroughCaptureMe());
  const [error, setError] = useState<string | null>(null);
  const clearingSession = useRef(false);
  const bootstrapAbortRef = useRef<AbortController | null>(null);

  const clearSession = useCallback(() => {
    if (clearingSession.current) return;
    clearingSession.current = true;
    clearAuthStorage();
    clearRolePreview();
    setRolePreview(null);
    setMe(null);
    setError(null);
    clearingSession.current = false;
  }, []);

  useEffect(() => {
    if (sessionMe) {
      setCachedAuthMe(sessionMe);
    } else if (!getBearerToken()) {
      clearCachedAuthMe();
    }
  }, [sessionMe]);

  useEffect(() => {
    if (!sessionMe || !rolePreview) return;
    if (sessionMe.tenantId !== rolePreview.tenantId) {
      clearRolePreview();
      setRolePreview(null);
    }
  }, [sessionMe, rolePreview]);

  useEffect(() => {
    const sync = () => {
      // Flush so walkthrough start elevates permissions before the first scene navigates.
      flushSync(() => setWalkthroughDemoActive(readWalkthroughDemoActive()));
    };
    sync();
    window.addEventListener(EXECUTIVE_WALKTHROUGH_SESSION_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EXECUTIVE_WALKTHROUGH_SESSION_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const me = useMemo(() => {
    let next: AuthMe | null = sessionMe;
    if (sessionMe && rolePreview && sessionMe.tenantId === rolePreview.tenantId) {
      next = applyRolePreviewToMe(sessionMe, rolePreview);
    }
    if (next && walkthroughDemoActive) {
      next = withWalkthroughDemoAccess(next);
    }
    return next;
  }, [sessionMe, rolePreview, walkthroughDemoActive]);

  const startRolePreview = useCallback((state: RolePreviewState) => {
    writeRolePreview(state);
    setRolePreview(state);
  }, []);

  const exitRolePreview = useCallback(() => {
    clearRolePreview();
    setRolePreview(null);
  }, []);

  useEffect(() => {
    configureApiClient({
      onUnauthorized: clearSession,
      tryRefreshSession: (options) => tryRefreshSession(options),
    });
  }, [clearSession]);

  // Keep React auth state in sync when the bearer token disappears (other tab
  // signed out, storage cleared, revoked session wipe). Without this, `me`
  // stays set and every module surfaces "Authorization Bearer token required".
  useEffect(() => {
    if (!me) return;

    const dropIfTokenMissing = () => {
      if (isWalkthroughCaptureSession()) return;
      if (!getBearerToken()) {
        clearSession();
      }
    };

    dropIfTokenMissing();
    const timer = window.setInterval(dropIfTokenMissing, 2_000);

    function onStorage(event: StorageEvent) {
      // Legacy keys only — bearer/refresh are memory-only after FIS-H01.
      if (
        (event.key === "forge-bearer-token" || event.key === "forge-refresh-token") &&
        !event.newValue &&
        !getBearerToken()
      ) {
        clearSession();
      }
    }
    window.addEventListener("storage", onStorage);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("storage", onStorage);
    };
  }, [me, clearSession]);

  // Proactively refresh Cognito access tokens before expiry so mid-session API
  // calls do not hit 401 → silent logout. Also refresh when the tab becomes
  // visible again (background timers are often throttled).
  useEffect(() => {
    if (!me) return;

    let cancelled = false;
    let timer: number | undefined;

    const schedule = () => {
      if (cancelled) return;
      const untilNear = msUntilAccessTokenNearExpiry(
        getBearerToken(),
        PROACTIVE_REFRESH_SKEW_SECONDS,
      );
      const delay =
        untilNear == null
          ? PROACTIVE_REFRESH_MAX_DELAY_MS
          : Math.min(
              Math.max(untilNear, PROACTIVE_REFRESH_MIN_DELAY_MS),
              PROACTIVE_REFRESH_MAX_DELAY_MS,
            );
      timer = window.setTimeout(() => {
        void (async () => {
          if (cancelled) return;
          await tryRefreshSession({ force: isAccessTokenExpiredOrNearExpiry(getBearerToken(), 120) });
          schedule();
        })();
      }, delay);
    };

    schedule();

    function onVisibility() {
      if (document.visibilityState !== "visible" || cancelled) return;
      void tryRefreshSession();
    }
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [me]);

  const refresh = useCallback(async () => {
    bootstrapAbortRef.current?.abort();
    const controller = new AbortController();
    bootstrapAbortRef.current = controller;
    const timer = window.setTimeout(() => controller.abort(), AUTH_BOOTSTRAP_TIMEOUT_MS);

    setLoading(true);
    setError(null);
    try {
      setMe(await establishSession(controller.signal));
    } catch (err) {
      const status = statusOf(err);
      if (status === 401) {
        setMe(null);
        clearCachedAuthMe();
        return;
      }
      // Keep a previously cached session when the network times out — clearing it
      // traps users with a refresh token that keeps failing the bootstrap budget.
      if (isAbortError(err)) {
        const cached = readInitialAuthMe();
        if (cached) {
          setMe(cached);
          setError(bootstrapErrorMessage(err));
        } else {
          setMe(null);
          setError(bootstrapErrorMessage(err));
        }
      } else {
        setMe(null);
        setError(bootstrapErrorMessage(err));
      }
    } finally {
      window.clearTimeout(timer);
      if (bootstrapAbortRef.current === controller) {
        bootstrapAbortRef.current = null;
      }
      setLoading(false);
    }
  }, []);

  /** After Cognito tokens are stored, load /auth/me and surface failures (including 401). */
  const establishSessionAfterLogin = useCallback(async () => {
    bootstrapAbortRef.current?.abort();
    const controller = new AbortController();
    bootstrapAbortRef.current = controller;
    const timer = window.setTimeout(() => controller.abort(), AUTH_BOOTSTRAP_TIMEOUT_MS);

    setLoading(true);
    setError(null);
    try {
      setMe(await establishSession(controller.signal));
    } catch (err) {
      setMe(null);
      const status = statusOf(err);
      const apiMessage = err instanceof Error ? err.message.trim() : "";
      const code =
        err && typeof err === "object" && "code" in err && typeof err.code === "string"
          ? err.code
          : undefined;
      let message: string;
      if (isAbortError(err)) {
        message = bootstrapErrorMessage(err);
      } else if (status === 401) {
        if (apiMessage.toLowerCase().includes("not linked")) {
          message =
            "This Cognito account is not linked to a Forge user yet. Ask an administrator to link it.";
        } else if (apiMessage.toLowerCase().includes("invalid") || apiMessage.toLowerCase().includes("expired")) {
          message = "Sign-in token was rejected by the API. Try again, or use SSO.";
        } else if (apiMessage && apiMessage.toLowerCase() !== "authentication failed") {
          message = apiMessage;
        } else {
          message =
            "Sign-in succeeded in Cognito, but Forge rejected the session (401). The account may not be linked or the token client is not allowed.";
        }
      } else if (status === 403) {
        message = apiMessage || "This account is not allowed to sign in.";
      } else if (status > 0) {
        message = apiMessage || `Sign-in failed (HTTP ${status}${code ? `, ${code}` : ""}).`;
      } else {
        message =
          apiMessage ||
          "Could not reach the Forge API after sign-in. Check that Field is proxying to api-dev.";
      }
      setError(message);
      throw new Error(message);
    } finally {
      window.clearTimeout(timer);
      if (bootstrapAbortRef.current === controller) {
        bootstrapAbortRef.current = null;
      }
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      // On the OAuth callback route, skip /auth/me until exchangeCodeForTokens
      // completes — a concurrent 401-with-bearer race can clear a just-written token.
      if (typeof window !== "undefined" && window.location.pathname.includes("/auth/callback")) {
        setLoading(false);
        return;
      }

      const captureMe = readWalkthroughCaptureMe();
      if (captureMe) {
        setMe(captureMe);
        setLoading(false);
        return;
      }

      const controller = new AbortController();
      bootstrapAbortRef.current = controller;
      const timer = window.setTimeout(() => controller.abort(), AUTH_BOOTSTRAP_TIMEOUT_MS);

      setLoading(true);
      setError(null);
      try {
        setMe(await establishSession(controller.signal));
      } catch (err) {
        // Effect cleanup aborts in-flight bootstrap on remount — do not surface that
        // as a user-facing timeout (common on static-export soft navigations).
        if (cancelled) return;

        // Unauthenticated visitors (no bearer / no linked session) are expected
        // on public routes — do not surface as a blocking shell error.
        // Stale or forbidden sessions (403) should clear local tokens and show login,
        // not a permanent "Request failed: 403" banner.
        const status = statusOf(err);
        if (status === 401 || status === 403) {
          setMe(null);
          clearAuthStorage();
        } else if (isAbortError(err)) {
          const cached = readInitialAuthMe();
          if (cached) {
            // Stay signed in on a soft timeout — a hard gate loop is worse than
            // using the last good /auth/me until the next authenticated call.
            setMe(cached);
          } else {
            setMe(null);
            clearCachedAuthMe();
            setError(bootstrapErrorMessage(err));
          }
        } else {
          setMe(null);
          clearCachedAuthMe();
          setError(bootstrapErrorMessage(err));
        }
      } finally {
        window.clearTimeout(timer);
        if (bootstrapAbortRef.current === controller) {
          bootstrapAbortRef.current = null;
        }
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void bootstrap();

    return () => {
      cancelled = true;
      bootstrapAbortRef.current?.abort();
    };
  }, [clearSession]);

  const loginWithCognito = useCallback(async () => {
    setError(null);
    try {
      await redirectToCognitoLogin();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
    }
  }, []);

  const loginWithPassword = useCallback(
    async (username: string, password: string) => {
      setError(null);
      await authenticateWithPassword({ username, password });
      await establishSessionAfterLogin();
    },
    [establishSessionAfterLogin],
  );

  const completeNewPassword = useCallback(
    async (
      challenge: Extract<CognitoPasswordChallenge, { kind: "new_password_required" }>,
      newPassword: string,
    ) => {
      setError(null);
      await completeNewPasswordChallenge({
        username: challenge.username,
        session: challenge.session,
        newPassword,
      });
      await establishSessionAfterLogin();
    },
    [establishSessionAfterLogin],
  );

  const completeMfa = useCallback(
    async (
      challenge: Extract<CognitoPasswordChallenge, { kind: "mfa_required" }>,
      code: string,
    ) => {
      setError(null);
      await completeMfaChallenge({
        username: challenge.username,
        session: challenge.session,
        code,
        delivery: challenge.delivery,
      });
      await establishSessionAfterLogin();
    },
    [establishSessionAfterLogin],
  );

  const logout = useCallback(async () => {
    setError(null);
    try {
      await runForgeBrowserCleanup("logout");
      await logoutAll();
    } catch {
      // Clear local session even when API logout fails.
    } finally {
      clearSession();
      if (typeof window !== "undefined") {
        try {
          window.location.assign(buildLogoutUrl());
        } catch {
          window.location.assign("/login/");
        }
      }
    }
  }, [clearSession]);

  const chooseTenant = useCallback(async (tenantId: string) => {
    setError(null);
    try {
      await runForgeBrowserCleanup("tenant-switch");
      clearRolePreview();
      setRolePreview(null);
      const updated = await switchActiveTenant({
        tenantId,
        previousTenantId: getActiveTenantId(),
        selectTenant,
        setActiveTenantId,
        clearActiveTenantId,
      });
      // Replace the entire AuthMe summary so prior tenant capabilities cannot linger.
      setMe(updated);
      syncTenantIdInUrl(tenantId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Tenant switch failed");
      throw err;
    }
  }, []);

  const signOutAll = logout;

  const hasPermission = useCallback(
    (code: string) => {
      if (!me) return false;
      if (rolePreview) return me.permissions.includes(code);
      if (me.isPlatformAdmin) return true;
      return me.permissions.includes(code);
    },
    [me, rolePreview],
  );

  const hasAnyPermission = useCallback(
    (codes: string[]) => codes.some((code) => hasPermission(code)),
    [hasPermission],
  );

  const hasAllPermissions = useCallback(
    (codes: string[]) => codes.length > 0 && codes.every((code) => hasPermission(code)),
    [hasPermission],
  );

  const hasProduct = useCallback(
    (productCode: string) => {
      if (!sessionMe) return false;
      // Product entitlement is tenant-scoped; role preview only overlays permissions.
      if (sessionMe.isPlatformAdmin) return true;
      return (sessionMe.activeProducts ?? []).includes(productCode);
    },
    [sessionMe],
  );

  const hasModule = useCallback(
    (moduleCode: string) => {
      if (!sessionMe) return false;
      if (walkthroughDemoActive && DEMO_WALKTHROUGH_MODULES.includes(moduleCode)) {
        return true;
      }
      if (!rolePreview && sessionMe.isPlatformAdmin) return true;
      return (sessionMe.activeModules ?? []).includes(moduleCode);
    },
    [sessionMe, rolePreview, walkthroughDemoActive],
  );

  const value = useMemo(
    () => ({
      me,
      loading,
      error,
      refresh,
      loginWithCognito,
      loginWithPassword,
      completeNewPassword,
      completeMfa,
      logout,
      chooseTenant,
      signOutAll,
      hasPermission,
      hasAnyPermission,
      hasAllPermissions,
      hasProduct,
      hasModule,
      rolePreview,
      startRolePreview,
      exitRolePreview,
    }),
    [
      me,
      loading,
      error,
      refresh,
      loginWithCognito,
      loginWithPassword,
      completeNewPassword,
      completeMfa,
      logout,
      chooseTenant,
      signOutAll,
      hasPermission,
      hasAnyPermission,
      hasAllPermissions,
      hasProduct,
      hasModule,
      rolePreview,
      startRolePreview,
      exitRolePreview,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}

export function usePermission(code: string): boolean {
  const { hasPermission } = useAuth();
  return hasPermission(code);
}

/** True when the session has at least one of the listed permission codes. */
export function useAnyPermission(codes: string[]): boolean {
  const { hasAnyPermission } = useAuth();
  return hasAnyPermission(codes);
}

/** True when the session has every listed permission code. Empty list is false. */
export function useAllPermissions(codes: string[]): boolean {
  const { hasAllPermissions } = useAuth();
  return hasAllPermissions(codes);
}

export function useProductEnabled(productCode: string): boolean {
  const { hasProduct } = useAuth();
  return hasProduct(productCode);
}

export function useModuleEnabled(moduleCode: string): boolean {
  const { hasModule } = useAuth();
  return hasModule(moduleCode);
}
