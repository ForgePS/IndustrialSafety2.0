import { getActiveTenantId, getBearerToken, getDevPrincipal, getCsrfToken } from "./auth-storage.js";

const FORGE_CSRF_HEADER = "x-forge-csrf";
const STATE_CHANGING_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);

export type ApiSuccess<T> = {
  data: T;
  meta: {
    requestId: string;
    correlationId: string;
    pagination?: { page: number; pageSize: number; total: number };
  };
};

export type ApiRequestOptions = {
  ifMatch?: string;
  idempotencyKey?: string;
  query?: Record<string, string | undefined>;
  signal?: AbortSignal;
};

export type ApiResult<T> = {
  data: T;
  etag?: string;
  meta?: ApiSuccess<T>["meta"];
};

export type ApiClientConfig = {
  baseUrl?: string;
  devPrincipalEnv?: string;
  /** Called only after refresh is unavailable or a post-refresh retry still returns 401. */
  onUnauthorized?: () => void;
  /**
   * Attempt Cognito refresh. Return true when a usable bearer was stored.
   * Pass `{ force: true }` after an authenticated 401.
   */
  tryRefreshSession?: (options?: { force?: boolean; signal?: AbortSignal }) => Promise<boolean>;
};

let clientConfig: ApiClientConfig = {};

export function configureApiClient(config: ApiClientConfig): void {
  clientConfig = { ...clientConfig, ...config };
}

export function getApiClientConfig(): ApiClientConfig {
  return clientConfig;
}

export function getApiBaseUrl(): string {
  // Empty string is valid: same-origin relative `/api/...` (CloudFront / Next proxy).
  if (clientConfig.baseUrl === undefined) {
    throw new Error(
      "API client baseUrl is not configured. Call configureApiClient({ baseUrl }) before requests.",
    );
  }
  return clientConfig.baseUrl.trim().replace(/\/$/, "");
}

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly details?: unknown;

  constructor(message: string, status: number, code?: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    if (code !== undefined) {
      this.code = code;
    }
    if (details !== undefined) {
      this.details = details;
    }
  }
}

export class ApiConflictError extends ApiError {
  constructor(message: string) {
    super(message, 412, "PRECONDITION_FAILED");
    this.name = "ApiConflictError";
  }
}

function allowDevPrincipal(): boolean {
  // Deployed builds must omit NEXT_PUBLIC_ALLOW_DEV_PRINCIPAL (see sync-static-site).
  // Hosted environments must not silently impersonate via leftover localStorage values.
  return process.env.NEXT_PUBLIC_ALLOW_DEV_PRINCIPAL === "true";
}

function devPrincipalHeader(): Record<string, string> {
  if (!allowDevPrincipal()) return {};
  const stored = getDevPrincipal();
  const raw = stored ?? clientConfig.devPrincipalEnv;
  if (!raw) return {};
  return { "x-forge-dev-principal": raw };
}

function authHeaders(): Record<string, string> {
  const bearer = getBearerToken();
  if (bearer) {
    return { Authorization: `Bearer ${bearer}` };
  }
  return devPrincipalHeader();
}

function buildQuery(query?: Record<string, string | undefined>): string {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") {
      params.set(key, value);
    }
  }
  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
}

function requestHeaders(
  options?: ApiRequestOptions,
  withJson = false,
  method?: string,
): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...authHeaders(),
  };
  const activeTenantId = getActiveTenantId();
  if (activeTenantId) {
    headers["x-tenant-id"] = activeTenantId;
  }
  if (withJson) {
    headers["Content-Type"] = "application/json";
  }
  if (options?.ifMatch) {
    headers["If-Match"] = options.ifMatch;
  }
  if (options?.idempotencyKey) {
    headers["Idempotency-Key"] = options.idempotencyKey;
  }
  if (method && STATE_CHANGING_METHODS.has(method)) {
    const csrf = getCsrfToken();
    if (csrf) {
      headers[FORGE_CSRF_HEADER] = csrf;
    }
  }
  return headers;
}

async function ensureFreshBearer(signal?: AbortSignal): Promise<void> {
  if (!clientConfig.tryRefreshSession) return;
  if (!getBearerToken()) return;
  try {
    await clientConfig.tryRefreshSession(signal ? { signal } : undefined);
  } catch {
    // Keep the existing bearer; the request may still succeed or recover via 401 retry.
  }
}

async function parseResponse<T>(
  res: Response,
  /**
   * Whether this request carried Authorization. Anonymous 401s (e.g. AuthProvider
   * bootstrap on /auth/callback) must not clear tokens that a concurrent OAuth
   * exchange just wrote to storage.
   */
  hadAuthorization: boolean,
  options?: { allowRefreshRetry?: boolean; signal?: AbortSignal },
): Promise<ApiResult<T>> {
  const etagHeader = res.headers.get("etag");
  let body: ApiSuccess<T> | { error: { message: string; code?: string } };
  try {
    body = (await res.json()) as ApiSuccess<T> | { error: { message: string; code?: string } };
  } catch {
    // Common after SPA deploys: CloudFront returns HTML (200) for a missing
    // asset/route; JSON parse fails and the old message looked like a success.
    throw new ApiError(
      `Non-JSON response (HTTP ${res.status}). Hard-refresh if this followed a deploy.`,
      res.status,
    );
  }

  if (res.status === 412) {
    const message = "error" in body ? body.error.message : "Resource was modified elsewhere";
    throw new ApiConflictError(message);
  }

  if (res.status === 401 && hadAuthorization) {
    const canRetry = options?.allowRefreshRetry !== false && Boolean(clientConfig.tryRefreshSession);
    if (canRetry) {
      const refreshed = await clientConfig.tryRefreshSession!({
        force: true,
        ...(options?.signal ? { signal: options.signal } : {}),
      });
      if (refreshed) {
        // Caller retries with a fresh Authorization header.
        throw new ApiError("ACCESS_TOKEN_REFRESHED", 401, "ACCESS_TOKEN_REFRESHED");
      }
    }
    clientConfig.onUnauthorized?.();
  }

  if (!res.ok || "error" in body) {
    const errBody =
      "error" in body
        ? (body.error as {
            message?: string;
            code?: string;
            details?: Array<{ path?: string; message?: string } | string>;
          })
        : undefined;
    let message = errBody?.message || `Request failed: ${res.status}`;
    const details = errBody?.details;
    if (
      (!errBody?.message || errBody.message === "Request validation failed") &&
      Array.isArray(details) &&
      details.length > 0
    ) {
      const summary = details
        .slice(0, 4)
        .map((d) =>
          typeof d === "string"
            ? d
            : [d.path, d.message].filter(Boolean).join(": ") || JSON.stringify(d),
        )
        .join("; ");
      if (summary) message = `Request validation failed (${summary})`;
    }
    const code = errBody?.code;
    throw new ApiError(message, res.status, code ?? undefined, details);
  }

  const result: ApiResult<T> = { data: body.data, meta: body.meta };
  if (etagHeader) {
    result.etag = etagHeader;
  }
  return result;
}

function isRefreshRetrySignal(err: unknown): boolean {
  return err instanceof ApiError && err.code === "ACCESS_TOKEN_REFRESHED";
}

export async function apiGet<T>(path: string, options?: ApiRequestOptions): Promise<T> {
  const result = await apiGetResult<T>(path, options);
  return result.data;
}

export async function apiGetResult<T>(
  path: string,
  options?: ApiRequestOptions,
): Promise<ApiResult<T>> {
  await ensureFreshBearer(options?.signal);
  const run = async (allowRefreshRetry: boolean) => {
    const headers = requestHeaders(options);
    const res = await fetch(`${getApiBaseUrl()}${path}${buildQuery(options?.query)}`, {
      headers,
      credentials: "include",
      cache: "no-store",
      ...(options?.signal ? { signal: options.signal } : {}),
    });
    return parseResponse<T>(res, Boolean(headers.Authorization), {
      allowRefreshRetry,
      ...(options?.signal ? { signal: options.signal } : {}),
    });
  };

  try {
    return await run(true);
  } catch (err) {
    if (!isRefreshRetrySignal(err)) throw err;
    return run(false);
  }
}

export async function apiSend<T>(
  path: string,
  method: "POST" | "PATCH" | "PUT" | "DELETE",
  payload?: unknown,
  options?: ApiRequestOptions,
): Promise<T> {
  const result = await apiSendResult<T>(path, method, payload, options);
  return result.data;
}

export async function apiSendResult<T>(
  path: string,
  method: "POST" | "PATCH" | "PUT" | "DELETE",
  payload?: unknown,
  options?: ApiRequestOptions,
): Promise<ApiResult<T>> {
  await ensureFreshBearer(options?.signal);
  const run = async (allowRefreshRetry: boolean) => {
    const headers = requestHeaders(options, payload !== undefined, method);
    const init: RequestInit = {
      method,
      headers,
      credentials: "include",
      cache: "no-store",
      ...(options?.signal ? { signal: options.signal } : {}),
    };
    if (payload !== undefined) {
      init.body = JSON.stringify(payload);
    }
    const res = await fetch(`${getApiBaseUrl()}${path}${buildQuery(options?.query)}`, init);
    return parseResponse<T>(res, Boolean(headers.Authorization), {
      allowRefreshRetry,
      ...(options?.signal ? { signal: options.signal } : {}),
    });
  };

  try {
    return await run(true);
  } catch (err) {
    if (!isRefreshRetrySignal(err)) throw err;
    return run(false);
  }
}

export async function apiFetchRaw(path: string): Promise<Response> {
  await ensureFreshBearer();
  const run = async () => {
    const headers = requestHeaders();
    return {
      headers,
      res: await fetch(`${getApiBaseUrl()}${path}`, {
        headers,
        credentials: "include",
        cache: "no-store",
      }),
    };
  };

  let { headers, res } = await run();
  if (res.status === 401 && headers.Authorization) {
    const refreshed = await clientConfig.tryRefreshSession?.({ force: true });
    if (refreshed) {
      ({ headers, res } = await run());
    } else {
      clientConfig.onUnauthorized?.();
    }
  }
  return res;
}

export function toIfMatch(recordVersion: number): string {
  return `W/"${recordVersion}"`;
}

export function createIdempotencyKey(prefix = "web"): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
