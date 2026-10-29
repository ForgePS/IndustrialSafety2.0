import { getBearerToken, getDevPrincipal } from "./auth-storage";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export type ApiSuccess<T> = {
  data: T;
  meta: {
    requestId: string;
    correlationId: string;
    page?: number;
    pageSize?: number;
    total?: number;
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

function devPrincipalHeader(): Record<string, string> {
  const stored = getDevPrincipal();
  const raw = stored ?? process.env.NEXT_PUBLIC_DEV_PRINCIPAL;
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

function requestHeaders(options?: ApiRequestOptions, withJson = false): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...authHeaders(),
  };
  if (withJson) {
    headers["Content-Type"] = "application/json";
  }
  if (options?.ifMatch) {
    headers["If-Match"] = options.ifMatch;
  }
  if (options?.idempotencyKey) {
    headers["Idempotency-Key"] = options.idempotencyKey;
  }
  return headers;
}

async function parseResponse<T>(res: Response): Promise<ApiResult<T>> {
  const etagHeader = res.headers.get("etag");
  let body: ApiSuccess<T> | { error: { message: string } };
  try {
    body = (await res.json()) as ApiSuccess<T> | { error: { message: string } };
  } catch {
    throw new Error(`Request failed: ${res.status}`);
  }
  if (!res.ok || "error" in body) {
    throw new Error("error" in body ? body.error.message : `Request failed: ${res.status}`);
  }
  const result: ApiResult<T> = { data: body.data, meta: body.meta };
  if (etagHeader) {
    result.etag = etagHeader;
  }
  return result;
}

export async function apiGet<T>(path: string, options?: ApiRequestOptions): Promise<T> {
  const result = await apiGetResult<T>(path, options);
  return result.data;
}

export async function apiGetResult<T>(
  path: string,
  options?: ApiRequestOptions,
): Promise<ApiResult<T>> {
  const res = await fetch(`${API_URL}${path}${buildQuery(options?.query)}`, {
    headers: requestHeaders(options),
    cache: "no-store",
    ...(options?.signal ? { signal: options.signal } : {}),
  });
  return parseResponse<T>(res);
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
  const init: RequestInit = {
    method,
    headers: requestHeaders(options, payload !== undefined),
    cache: "no-store",
  };
  if (payload !== undefined) {
    init.body = JSON.stringify(payload);
  }
  const res = await fetch(`${API_URL}${path}${buildQuery(options?.query)}`, init);
  return parseResponse<T>(res);
}

export type AuthTenant = {
  tenantId: string;
  slug: string;
  displayName: string;
  tenantStatus: string;
  membershipId: string | null;
  membershipStatus: string;
  isDefaultTenant: boolean;
  selectable: boolean;
};

export type AuthMe = {
  userId: string;
  personId: string | null;
  tenantId: string;
  organizationIds: string[];
  permissions: string[];
  activeProducts: string[];
  activeModules: string[];
  isPlatformAdmin: boolean;
  authProvider: string;
  tenants: AuthTenant[];
};

export function authMe(): Promise<AuthMe> {
  return apiGet<AuthMe>("/api/v1/auth/me");
}

export function selectTenant(tenantId: string): Promise<AuthMe> {
  return apiSend<AuthMe>("/api/v1/auth/select-tenant", "POST", { tenantId });
}

export function logoutAll(): Promise<{ sessionVersion: number }> {
  return apiSend<{ sessionVersion: number }>("/api/v1/auth/logout-all", "POST");
}

export function toIfMatch(recordVersion: number): string {
  return `W/"${recordVersion}"`;
}

export type Membership = {
  id: string;
  tenantId: string;
  userId: string;
  status: string;
  isDefaultTenant: boolean;
  activatedAt: string | null;
  suspendedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  recordVersion: number;
  createdAt: string;
  updatedAt: string;
  email: string;
  userStatus: string;
};

export function listMemberships(
  tenantId: string,
  query?: { status?: string; userId?: string },
): Promise<Membership[]> {
  const options: ApiRequestOptions = {};
  if (query) {
    options.query = query;
  }
  return apiGet<Membership[]>(`/api/v1/tenants/${tenantId}/memberships`, options);
}

export function getMembership(
  tenantId: string,
  membershipId: string,
): Promise<ApiResult<Membership>> {
  return apiGetResult<Membership>(`/api/v1/tenants/${tenantId}/memberships/${membershipId}`);
}

export function suspendMembership(
  tenantId: string,
  membershipId: string,
  reason: string,
  ifMatch: string,
): Promise<Membership> {
  return apiSend<Membership>(
    `/api/v1/tenants/${tenantId}/memberships/${membershipId}/suspend`,
    "POST",
    { reason },
    { ifMatch },
  );
}

export function activateMembership(
  tenantId: string,
  membershipId: string,
  ifMatch: string,
): Promise<Membership> {
  return apiSend<Membership>(
    `/api/v1/tenants/${tenantId}/memberships/${membershipId}/activate`,
    "POST",
    undefined,
    { ifMatch },
  );
}

export function revokeMembership(
  tenantId: string,
  membershipId: string,
  reason: string,
  ifMatch: string,
): Promise<Membership> {
  return apiSend<Membership>(
    `/api/v1/tenants/${tenantId}/memberships/${membershipId}/revoke`,
    "POST",
    { reason },
    { ifMatch },
  );
}

export type Invitation = {
  id: string;
  tenantId: string;
  email: string;
  status: string;
  firstName: string | null;
  lastName: string | null;
  expiresAt: string | null;
  sentAt: string | null;
  acceptedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export function listInvitations(query?: {
  tenantId?: string;
  status?: string;
  email?: string;
}): Promise<Invitation[]> {
  const options: ApiRequestOptions = {};
  if (query) {
    options.query = query;
  }
  return apiGet<Invitation[]>("/api/v1/auth/invitations", options);
}

export function createInvitation(
  payload: {
    tenantId: string;
    email: string;
    firstName?: string;
    lastName?: string;
    roleCodes?: string[];
    send?: boolean;
  },
  options?: ApiRequestOptions,
): Promise<Invitation> {
  return apiSend<Invitation>("/api/v1/auth/invitations", "POST", payload, options);
}

export function resendInvitation(
  invitationId: string,
  query?: { tenantId?: string },
): Promise<Invitation> {
  const options: ApiRequestOptions = {};
  if (query) {
    options.query = query;
  }
  return apiSend<Invitation>(
    `/api/v1/auth/invitations/${invitationId}/resend`,
    "POST",
    undefined,
    options,
  );
}

export function revokeInvitation(
  invitationId: string,
  reason: string,
  query?: { tenantId?: string },
): Promise<Invitation> {
  const options: ApiRequestOptions = {};
  if (query) {
    options.query = query;
  }
  return apiSend<Invitation>(
    `/api/v1/auth/invitations/${invitationId}/revoke`,
    "POST",
    { reason },
    options,
  );
}
