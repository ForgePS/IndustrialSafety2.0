import {
  isLocalDevOrigin,
  isOriginAllowed,
  parseCorsOriginRules,
  type CorsOriginRules,
} from "../../common/cors-origin.js";

export const FORGE_CSRF_HEADER = "x-forge-csrf";

const HOST_SESSION_COOKIE = "__Host-forge-session";
const DEV_SESSION_COOKIE = "forge-session";

export type SessionCookieRequestHints = {
  /** Full request URL protocol, or derived from x-forwarded-proto. */
  protocol: string;
  host: string;
};

export function sessionCookieName(hints: SessionCookieRequestHints): string {
  const host = hints.host.split(":")[0]?.toLowerCase() ?? "";
  const https = hints.protocol === "https";
  const isLocalHost = host === "localhost" || host === "127.0.0.1";
  if (https && !isLocalHost) {
    return HOST_SESSION_COOKIE;
  }
  return DEV_SESSION_COOKIE;
}

export type SessionCookieOptions = {
  maxAgeSeconds: number;
  secure: boolean;
  cookieName: string;
};

export function buildSessionSetCookie(
  rawSessionToken: string,
  options: SessionCookieOptions,
): string {
  const parts = [
    `${options.cookieName}=${encodeURIComponent(rawSessionToken)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${Math.max(0, Math.floor(options.maxAgeSeconds))}`,
  ];
  if (options.secure) {
    parts.push("Secure");
  }
  // Never set Domain — required for __Host- and preferred for session isolation.
  return parts.join("; ");
}

export function buildClearSessionCookie(options: Pick<SessionCookieOptions, "secure" | "cookieName">): string {
  const parts = [
    `${options.cookieName}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    "Max-Age=0",
  ];
  if (options.secure) {
    parts.push("Secure");
  }
  return parts.join("; ");
}

export function parseCookieHeader(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader) return {};
  const out: Record<string, string> = {};
  for (const part of cookieHeader.split(";")) {
    const idx = part.indexOf("=");
    if (idx <= 0) continue;
    const name = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (!name) continue;
    try {
      out[name] = decodeURIComponent(value);
    } catch {
      out[name] = value;
    }
  }
  return out;
}

export function readSessionTokenFromCookieHeader(
  cookieHeader: string | undefined,
  hints: SessionCookieRequestHints,
): string | null {
  const cookies = parseCookieHeader(cookieHeader);
  const preferred = sessionCookieName(hints);
  const raw = cookies[preferred] ?? cookies[HOST_SESSION_COOKIE] ?? cookies[DEV_SESSION_COOKIE];
  return raw && raw.length > 0 ? raw : null;
}

export function corsRulesFromEnv(env: {
  CORS_ORIGINS?: string;
  CORS_ORIGIN_SUFFIXES?: string;
}): CorsOriginRules {
  return parseCorsOriginRules(env.CORS_ORIGINS, env.CORS_ORIGIN_SUFFIXES);
}

/**
 * Validate Origin (preferred) or Referer against the CORS allowlist / request host.
 * Returns true when the mutating browser request is same-site / allowlisted.
 */
export function isTrustedBrowserOrigin(input: {
  origin: string | undefined;
  referer: string | undefined;
  requestHost: string;
  requestProtocol: string;
  rules: CorsOriginRules;
  appEnv: string;
}): boolean {
  const candidate = normalizeOriginCandidate(input.origin, input.referer);
  if (!candidate) {
    // Non-browser / same-origin navigations may omit Origin; require Referer or deny.
    return false;
  }

  if (isOriginAllowed(candidate, input.rules)) {
    return true;
  }

  if (input.appEnv === "local" && isLocalDevOrigin(candidate)) {
    return true;
  }

  try {
    const url = new URL(candidate);
    const reqHost = input.requestHost.split(":")[0]?.toLowerCase() ?? "";
    const candHost = url.hostname.toLowerCase();
    if (candHost === reqHost) {
      const expectHttps = input.requestProtocol === "https";
      if (expectHttps && url.protocol === "https:") return true;
      if (!expectHttps && (url.protocol === "http:" || url.protocol === "https:")) return true;
    }
  } catch {
    return false;
  }

  return false;
}

function normalizeOriginCandidate(
  origin: string | undefined,
  referer: string | undefined,
): string | null {
  const rawOrigin = origin?.trim();
  if (rawOrigin && rawOrigin !== "null") {
    return rawOrigin;
  }
  const rawReferer = referer?.trim();
  if (!rawReferer) return null;
  try {
    const url = new URL(rawReferer);
    return url.origin;
  } catch {
    return null;
  }
}

export function requestProtocolAndHost(req: {
  protocol?: string;
  headers: Record<string, string | string[] | undefined>;
}): SessionCookieRequestHints {
  const xfProto = headerValue(req.headers["x-forwarded-proto"]);
  const protocol = (xfProto?.split(",")[0]?.trim() || req.protocol || "http").replace(/:$/, "");
  const host =
    headerValue(req.headers["x-forwarded-host"])?.split(",")[0]?.trim() ||
    headerValue(req.headers.host) ||
    "localhost";
  return { protocol, host };
}

function headerValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}
