export type ApiAuthConfig =
  | { type: "none" }
  | { type: "bearer"; tokenRef: string }
  | { type: "api_key"; headerName: string; secretRef: string }
  | {
      type: "oauth2_client_credentials";
      tokenUrl: string;
      clientIdRef: string;
      clientSecretRef: string;
    };

export type ApiPaginationConfig =
  | { type: "none" }
  | { type: "offset"; limitParam: string; offsetParam: string; pageSize: number }
  | { type: "cursor"; cursorParam: string; cursorPath: string; pageSize: number };

export type ApiRetryConfig = {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  retryOnStatus: number[];
};

export type ApiRateLimitConfig = {
  maxRequestsPerSecond: number;
  burst?: number;
};

export type ApiImportSourceConfig = {
  baseUrl: string;
  path: string;
  method: "GET" | "POST";
  auth: ApiAuthConfig;
  pagination: ApiPaginationConfig;
  retry: ApiRetryConfig;
  rateLimit: ApiRateLimitConfig;
  responseRecordsPath: string;
  timeoutMs?: number;
};

export type ApiImportValidationResult =
  | { ok: true; normalized: ApiImportSourceConfig }
  | { ok: false; code: string; message: string; details?: string[] };

const DEFAULT_RETRY: ApiRetryConfig = {
  maxAttempts: 3,
  baseDelayMs: 250,
  maxDelayMs: 5000,
  retryOnStatus: [408, 429, 500, 502, 503, 504],
};

const DEFAULT_RATE: ApiRateLimitConfig = {
  maxRequestsPerSecond: 5,
  burst: 5,
};

function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Validates shared external API import configuration.
 * Does not call product APIs or store credentials — refs only.
 */
export function validateApiImportSourceConfig(raw: unknown): ApiImportValidationResult {
  const details: string[] = [];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {
      ok: false,
      code: "IMPORT_API_CONFIG_INVALID",
      message: "API source config must be an object",
    };
  }
  const cfg = raw as Record<string, unknown>;
  if (typeof cfg.baseUrl !== "string" || !isHttpsUrl(cfg.baseUrl)) {
    details.push("baseUrl must be an https URL");
  }
  if (typeof cfg.path !== "string" || !cfg.path.startsWith("/")) {
    details.push("path must start with /");
  }
  if (cfg.method !== "GET" && cfg.method !== "POST") {
    details.push("method must be GET or POST");
  }
  if (typeof cfg.responseRecordsPath !== "string" || !cfg.responseRecordsPath.trim()) {
    details.push("responseRecordsPath is required");
  }

  const auth = cfg.auth as Record<string, unknown> | undefined;
  if (!auth || typeof auth.type !== "string") {
    details.push("auth.type is required");
  } else if (!["none", "bearer", "api_key", "oauth2_client_credentials"].includes(auth.type)) {
    details.push("auth.type is unsupported");
  } else if (auth.type === "bearer" && typeof auth.tokenRef !== "string") {
    details.push("auth.tokenRef is required for bearer");
  } else if (
    auth.type === "api_key" &&
    (typeof auth.headerName !== "string" || typeof auth.secretRef !== "string")
  ) {
    details.push("auth.headerName and auth.secretRef are required for api_key");
  } else if (
    auth.type === "oauth2_client_credentials" &&
    (typeof auth.tokenUrl !== "string" ||
      !isHttpsUrl(auth.tokenUrl) ||
      typeof auth.clientIdRef !== "string" ||
      typeof auth.clientSecretRef !== "string")
  ) {
    details.push("oauth2_client_credentials requires https tokenUrl and client refs");
  }

  if (details.length > 0) {
    return {
      ok: false,
      code: "IMPORT_API_CONFIG_INVALID",
      message: "API source configuration failed validation",
      details,
    };
  }

  const pagination = (cfg.pagination as ApiPaginationConfig | undefined) ?? { type: "none" };
  const retry = {
    ...DEFAULT_RETRY,
    ...((cfg.retry as Partial<ApiRetryConfig> | undefined) ?? {}),
  };
  const rateLimit = {
    ...DEFAULT_RATE,
    ...((cfg.rateLimit as Partial<ApiRateLimitConfig> | undefined) ?? {}),
  };

  return {
    ok: true,
    normalized: {
      baseUrl: String(cfg.baseUrl).replace(/\/$/, ""),
      path: String(cfg.path),
      method: cfg.method as "GET" | "POST",
      auth: auth as ApiAuthConfig,
      pagination,
      retry,
      rateLimit,
      responseRecordsPath: String(cfg.responseRecordsPath),
      ...(typeof cfg.timeoutMs === "number" ? { timeoutMs: cfg.timeoutMs } : {}),
    },
  };
}

/** Computes exponential backoff delay with deterministic jitter factor. */
export function computeRetryDelayMs(
  attempt: number,
  retry: ApiRetryConfig,
  jitterFactor = 0,
): number {
  const exp = Math.min(retry.maxDelayMs, retry.baseDelayMs * 2 ** Math.max(0, attempt - 1));
  const jitter = Math.max(0, Math.min(1, jitterFactor));
  return Math.round(exp * (1 - jitter * 0.2));
}

export type ApiFetchPageRequest = {
  config: ApiImportSourceConfig;
  pageToken?: string | null;
  offset?: number;
  resolvedAuthHeaders: Record<string, string>;
};

/**
 * Builds the next page request URL/query for the shared API importer.
 * Transport is adapter-supplied; this stays product-neutral.
 */
export function buildApiPageRequest(input: ApiFetchPageRequest): {
  url: string;
  method: "GET" | "POST";
  headers: Record<string, string>;
} {
  const url = new URL(input.config.path, `${input.config.baseUrl}/`);
  if (input.config.pagination.type === "offset") {
    url.searchParams.set(
      input.config.pagination.limitParam,
      String(input.config.pagination.pageSize),
    );
    url.searchParams.set(input.config.pagination.offsetParam, String(input.offset ?? 0));
  } else if (input.config.pagination.type === "cursor" && input.pageToken) {
    url.searchParams.set(input.config.pagination.cursorParam, input.pageToken);
    url.searchParams.set("limit", String(input.config.pagination.pageSize));
  }
  return {
    url: url.toString(),
    method: input.config.method,
    headers: {
      Accept: "application/json",
      ...input.resolvedAuthHeaders,
    },
  };
}

export function extractRecordsFromApiPayload(payload: unknown, recordsPath: string): unknown[] {
  if (!recordsPath || recordsPath === "$" || recordsPath === ".") {
    return Array.isArray(payload) ? payload : [];
  }
  const parts = recordsPath.split(".").filter(Boolean);
  let cursor: unknown = payload;
  for (const part of parts) {
    if (!cursor || typeof cursor !== "object") return [];
    cursor = (cursor as Record<string, unknown>)[part];
  }
  return Array.isArray(cursor) ? cursor : [];
}
