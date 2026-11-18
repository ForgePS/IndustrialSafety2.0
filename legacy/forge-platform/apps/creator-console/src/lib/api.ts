import {
  getApiBaseUrl,
  getBearerToken,
  getDevPrincipal,
  authMe as webKitAuthMe,
  selectTenant as webKitSelectTenant,
  logoutAll as webKitLogoutAll,
  type AuthMe,
  type AuthTenant,
} from "@forge/web-kit";

export type { AuthMe, AuthTenant };

const allowDevPrincipal = process.env.NEXT_PUBLIC_ALLOW_DEV_PRINCIPAL === "true";

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

function apiUrl(): string {
  return getApiBaseUrl();
}

function devPrincipalHeader(): Record<string, string> {
  if (!allowDevPrincipal) return {};
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
  let body:
    | ApiSuccess<T>
    | {
        error: {
          message: string;
          code?: string;
          details?: Array<{ path?: string; message?: string }>;
          debugMessage?: string;
          debugName?: string;
        };
      };
  try {
    body = (await res.json()) as
      | ApiSuccess<T>
      | {
          error: {
            message: string;
            code?: string;
            details?: Array<{ path?: string; message?: string }>;
            debugMessage?: string;
            debugName?: string;
          };
        };
  } catch {
    throw new Error(`Request failed: ${res.status}`);
  }
  if (!res.ok || "error" in body) {
    if ("error" in body) {
      const details = Array.isArray(body.error.details)
        ? body.error.details
            .map((d) => {
              const path = d.path ? `${d.path}: ` : "";
              return `${path}${d.message ?? ""}`.trim();
            })
            .filter(Boolean)
            .join("; ")
        : "";
      const debug = body.error.debugMessage
        ? ` [${body.error.debugName ?? "error"}: ${body.error.debugMessage}]`
        : "";
      const extra = [details, debug].filter(Boolean).join(" ");
      throw new Error(extra ? `${body.error.message} (${extra})` : body.error.message);
    }
    throw new Error(`Request failed: ${res.status}`);
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
  const res = await fetch(`${apiUrl()}${path}${buildQuery(options?.query)}`, {
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
  const res = await fetch(`${apiUrl()}${path}${buildQuery(options?.query)}`, init);
  return parseResponse<T>(res);
}

export async function apiFetchRaw(path: string): Promise<Response> {
  return fetch(`${apiUrl()}${path}`, {
    headers: requestHeaders(),
    cache: "no-store",
  });
}

// ---------------------------------------------------------------------------
// Auth (delegates to @forge/web-kit — Cognito access_token only)
// ---------------------------------------------------------------------------

export function authMe(): Promise<AuthMe> {
  return webKitAuthMe();
}

export function selectTenant(tenantId: string): Promise<AuthMe> {
  return webKitSelectTenant(tenantId);
}

export function logoutAll(): Promise<{ sessionVersion: number }> {
  return webKitLogoutAll();
}

// ---------------------------------------------------------------------------
// Invitations
// ---------------------------------------------------------------------------

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

export function getInvitation(
  invitationId: string,
  query?: { tenantId?: string },
): Promise<Invitation> {
  const options: ApiRequestOptions = {};
  if (query) {
    options.query = query;
  }
  return apiGet<Invitation>(`/api/v1/auth/invitations/${invitationId}`, options);
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

// ---------------------------------------------------------------------------
// Memberships
// ---------------------------------------------------------------------------

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

export function createMembership(
  tenantId: string,
  payload: {
    userId: string;
    status?: "PENDING" | "ACTIVE";
    roleCodes?: string[];
  },
  options?: ApiRequestOptions,
): Promise<Membership> {
  return apiSend<Membership>(`/api/v1/tenants/${tenantId}/memberships`, "POST", payload, options);
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

export function membershipHistory(tenantId: string, membershipId: string) {
  return apiGet<
    Array<{
      id: string;
      action: string;
      fromStatus: string | null;
      toStatus: string | null;
      reason: string | null;
      occurredAt: string;
    }>
  >(`/api/v1/tenants/${tenantId}/memberships/${membershipId}/history`);
}

// ---------------------------------------------------------------------------
// Platform onboarding (ADR-027 / MK-S7)
// ---------------------------------------------------------------------------

export type OnboardingStepRow = {
  id: string;
  stepNumber: number;
  stepKey: string;
  status: "PENDING" | "COMPLETED" | "SKIPPED" | "FAILED" | string;
  payloadJson?: Record<string, unknown>;
  validationErrorsJson?: Array<{ code?: string; message?: string }>;
};

export type OnboardingSessionRecord = {
  id: string;
  tenantId: string;
  status: string;
  currentStep: number;
  templateCode: string | null;
  customerType: string;
  recordVersion: number;
  sessionDataJson?: Record<string, unknown>;
  activationErrorsJson?: Array<{ code?: string; message?: string }>;
};

export type OnboardingSessionView = {
  session: OnboardingSessionRecord;
  steps: OnboardingStepRow[];
  template?: {
    code: string;
    name: string;
    productCode: string;
    modules: Array<{ code: string; name: string; isCore: boolean }>;
    roles: Array<{ code: string; name: string }>;
  } | null;
};

/** @deprecated Use OnboardingSessionView — kept for older scaffold imports. */
export type OnboardingSession = OnboardingSessionRecord;

export async function onboardingListSessions(): Promise<OnboardingSessionView[]> {
  return apiGet<OnboardingSessionView[]>("/api/v1/platform/onboarding/sessions");
}

export async function onboardingGetSession(
  sessionId: string,
  tenantId?: string,
): Promise<ApiResult<OnboardingSessionView>> {
  const options: ApiRequestOptions = {};
  if (tenantId) options.query = { tenantId };
  return apiGetResult<OnboardingSessionView>(
    `/api/v1/platform/onboarding/sessions/${sessionId}`,
    options,
  );
}

export async function onboardingStart(payload: {
  customerType: string;
  templateCode?: string;
  tenantKey: string;
  slug: string;
  legalName: string;
  displayName: string;
  timezone?: string;
}): Promise<ApiResult<OnboardingSessionView>> {
  return apiSendResult<OnboardingSessionView>(
    "/api/v1/platform/onboarding/sessions",
    "POST",
    payload,
    { idempotencyKey: `onboard-start-${payload.tenantKey}-${Date.now()}` },
  );
}

export async function onboardingCompleteStep(
  sessionId: string,
  stepKey: string,
  payload: Record<string, unknown>,
  options: { ifMatch: string; tenantId?: string },
): Promise<ApiResult<OnboardingSessionView>> {
  const request: ApiRequestOptions = { ifMatch: options.ifMatch };
  if (options.tenantId) request.query = { tenantId: options.tenantId };
  return apiSendResult<OnboardingSessionView>(
    `/api/v1/platform/onboarding/sessions/${sessionId}/steps/${stepKey}/complete`,
    "POST",
    payload,
    request,
  );
}

export async function onboardingActivate(
  sessionId: string,
  options: { ifMatch: string; tenantId?: string },
): Promise<
  ApiResult<
    OnboardingSessionView & { tenant?: { id: string; displayName: string; status: string } }
  >
> {
  const request: ApiRequestOptions = { ifMatch: options.ifMatch };
  if (options.tenantId) request.query = { tenantId: options.tenantId };
  return apiSendResult(
    `/api/v1/platform/onboarding/sessions/${sessionId}/activate`,
    "POST",
    undefined,
    request,
  );
}

export async function onboardingListTemplates(): Promise<
  Array<{
    code: string;
    name: string;
    customerType: string;
    productCode: string;
    modules: Array<{ code: string; name: string; isCore: boolean }>;
    roles: Array<{ code: string; name: string }>;
  }>
> {
  return apiGet("/api/v1/platform/onboarding/templates");
}

export function humanizeForgeError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("email")) return "Please enter a valid email address.";
  if (lower.includes("permission") || lower.includes("403")) {
    return "You don't have permission to perform this action.";
  }
  if (lower.includes("payload too large") || lower.includes("413")) {
    return "This file exceeds the allowed upload size.";
  }
  if (lower.includes("foreign key") || lower.includes("department")) {
    return "Please select a department.";
  }
  if (lower.includes("cognito")) {
    return "Administrator invitation could not be created. Verify the email address and try again.";
  }
  if (lower.includes("if-match") || lower.includes("precondition")) {
    return "This page was updated elsewhere. Refresh and try again.";
  }
  return message.replace(/ValidationError\s*/gi, "").replace(/invalid_string/gi, "invalid value");
}

// ---------------------------------------------------------------------------
// Plans & pricing (platform catalog)
// ---------------------------------------------------------------------------

export type SubscriptionPlan = {
  id: string;
  code: string;
  name: string;
  billingInterval: string;
  status: string;
  basePriceCents: number | null;
  currency: string;
  configurationJson?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type PlanPrice = {
  id: string;
  planId: string;
  code: string;
  nickname: string;
  interval: string;
  amountCents: number | null;
  currency: string;
  billingType: string;
  status: string;
  configurationJson?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type SubscriptionPlanDetail = SubscriptionPlan & { prices: PlanPrice[] };

export function listPlans(options?: { includeArchived?: boolean }): Promise<SubscriptionPlan[]> {
  const request: ApiRequestOptions = {};
  if (options?.includeArchived) {
    request.query = { includeArchived: "true" };
  }
  return apiGet<SubscriptionPlan[]>("/api/v1/platform/plans", request);
}

export function getPlan(planCode: string): Promise<SubscriptionPlanDetail> {
  return apiGet<SubscriptionPlanDetail>(`/api/v1/platform/plans/${encodeURIComponent(planCode)}`);
}

export function createPlan(payload: {
  code: string;
  name: string;
  billingInterval: string;
  basePriceCents?: number | null;
  currency?: string;
  status?: string;
}): Promise<SubscriptionPlan> {
  return apiSend<SubscriptionPlan>("/api/v1/platform/plans", "POST", payload);
}

export function patchPlan(
  planCode: string,
  payload: Partial<{
    name: string;
    billingInterval: string;
    basePriceCents: number | null;
    currency: string;
    status: string;
  }>,
): Promise<SubscriptionPlan> {
  return apiSend<SubscriptionPlan>(
    `/api/v1/platform/plans/${encodeURIComponent(planCode)}`,
    "PATCH",
    payload,
  );
}

export type DeletePlanResult = {
  mode: "deleted" | "archived";
  plan: { id: string; code: string; name: string; status?: string };
  subscriptionCount: number;
  message: string;
};

/** Permanently deletes an unused plan; archives if subscriptions still reference it. */
export function deletePlan(planCode: string): Promise<DeletePlanResult> {
  return apiSend<DeletePlanResult>(
    `/api/v1/platform/plans/${encodeURIComponent(planCode)}`,
    "DELETE",
  );
}

/** @deprecated Prefer deletePlan — DELETE now hard-deletes unused plans or archives in-use ones. */
export function archivePlan(planCode: string): Promise<DeletePlanResult> {
  return deletePlan(planCode);
}

export function listPlanPrices(
  planCode: string,
  options?: { includeArchived?: boolean },
): Promise<PlanPrice[]> {
  const request: ApiRequestOptions = {};
  if (options?.includeArchived) {
    request.query = { includeArchived: "true" };
  }
  return apiGet<PlanPrice[]>(
    `/api/v1/platform/plans/${encodeURIComponent(planCode)}/prices`,
    request,
  );
}

export function createPlanPrice(
  planCode: string,
  payload: {
    code: string;
    nickname: string;
    interval: string;
    amountCents?: number | null;
    currency?: string;
    billingType?: string;
    status?: string;
  },
): Promise<PlanPrice> {
  return apiSend<PlanPrice>(
    `/api/v1/platform/plans/${encodeURIComponent(planCode)}/prices`,
    "POST",
    payload,
  );
}

export function patchPlanPrice(
  planCode: string,
  priceCode: string,
  payload: Partial<{
    nickname: string;
    interval: string;
    amountCents: number | null;
    currency: string;
    billingType: string;
    status: string;
  }>,
): Promise<PlanPrice> {
  return apiSend<PlanPrice>(
    `/api/v1/platform/plans/${encodeURIComponent(planCode)}/prices/${encodeURIComponent(priceCode)}`,
    "PATCH",
    payload,
  );
}

export function archivePlanPrice(planCode: string, priceCode: string): Promise<PlanPrice> {
  return apiSend<PlanPrice>(
    `/api/v1/platform/plans/${encodeURIComponent(planCode)}/prices/${encodeURIComponent(priceCode)}`,
    "DELETE",
  );
}

// ---------------------------------------------------------------------------
// Subscriptions (tenant)
// ---------------------------------------------------------------------------

export type TenantSubscription = {
  id: string;
  tenantId: string;
  planId: string;
  status: string;
  billingProvider: string;
  billingType: string;
  externalSubscriptionId: string | null;
  cancelAtPeriodEnd: boolean;
  recordVersion: number;
  createdAt: string;
  updatedAt: string;
  planCode: string | null;
  planName: string | null;
  billingInterval: string | null;
  billingCycle: string | null;
  renewsAt: string | null;
  endsAt: string | null;
  startedAt: string | null;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
};

export function listSubscriptions(tenantId: string): Promise<TenantSubscription[]> {
  return apiGet<TenantSubscription[]>(`/api/v1/tenants/${tenantId}/subscriptions`);
}

export function getCurrentSubscription(tenantId: string): Promise<ApiResult<TenantSubscription>> {
  return apiGetResult<TenantSubscription>(`/api/v1/tenants/${tenantId}/subscriptions/current`);
}

export function createSubscription(
  tenantId: string,
  payload: {
    planCode: string;
    status?: string;
    billingProvider?: string;
    periodDays?: number;
  },
  options?: ApiRequestOptions,
): Promise<TenantSubscription> {
  return apiSend<TenantSubscription>(
    `/api/v1/tenants/${tenantId}/subscriptions`,
    "POST",
    payload,
    options,
  );
}

export function patchSubscription(
  tenantId: string,
  subscriptionId: string,
  payload: {
    status?: string;
    cancelAtPeriodEnd?: boolean;
    externalSubscriptionId?: string | null;
  },
  ifMatch: string,
): Promise<TenantSubscription> {
  return apiSend<TenantSubscription>(
    `/api/v1/tenants/${tenantId}/subscriptions/${subscriptionId}`,
    "PATCH",
    payload,
    { ifMatch },
  );
}

export function suspendSubscription(
  tenantId: string,
  subscriptionId: string,
  ifMatch: string,
): Promise<TenantSubscription> {
  return apiSend<TenantSubscription>(
    `/api/v1/tenants/${tenantId}/subscriptions/${subscriptionId}/suspend`,
    "POST",
    undefined,
    { ifMatch },
  );
}

export function reactivateSubscription(
  tenantId: string,
  subscriptionId: string,
  ifMatch: string,
): Promise<TenantSubscription> {
  return apiSend<TenantSubscription>(
    `/api/v1/tenants/${tenantId}/subscriptions/${subscriptionId}/reactivate`,
    "POST",
    undefined,
    { ifMatch },
  );
}

// ---------------------------------------------------------------------------
// Billing contracts (tenant)
// ---------------------------------------------------------------------------

export type BillingContract = {
  id: string;
  name: string;
  status: string;
  billingType: string;
  startsOn: string | null;
  endsOn: string | null;
  renewalOn: string | null;
  setupFeeCents: number | null;
  notes: string | null;
  recordVersion: number;
  pricingJson?: {
    overrideAmountCents?: number;
    currency?: string;
    modules?: Array<{ moduleCode: string; amountCents: number }>;
  };
};

export type BillingOverview = {
  customer: {
    id: string;
    displayName: string;
    billingEmail: string | null;
    recordVersion: number;
  } | null;
  subscription: {
    id: string;
    status: string;
    planCode: string | null;
    planName: string | null;
    billingInterval: string | null;
    billingType?: string;
  } | null;
  contracts: BillingContract[];
  invoices: BillingInvoice[];
  fees: BillingFeeLine[];
};

export type BillingInvoice = {
  id: string;
  status: string;
  currency: string;
  amountDueCents: number;
  amountPaidCents: number;
  externalInvoiceId: string | null;
  hostedInvoiceUrl: string | null;
  recordVersion: number;
  createdAt: string;
};

export type BillingFeeLine = {
  id: string;
  feeType: string;
  amountCents: number;
  currency: string;
  description: string | null;
  contractId: string | null;
  orderId: string | null;
  createdAt: string;
};

export type PlatformProduct = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  status: string;
  platformKey?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PlatformModule = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  status: string;
  isCore: boolean;
  category: string;
  classification: string;
  implementationStatus: string;
  availabilityLabel: string;
  customerAssignable: boolean;
  displayOrder: number;
  productId: string;
  productCode: string;
  productName: string;
  platformKey?: string | null;
  customerAssignmentCount: number;
  route: string | null;
};

export function listPlatformProducts(options?: {
  includeArchived?: boolean;
}): Promise<PlatformProduct[]> {
  const request: ApiRequestOptions = {};
  if (options?.includeArchived) {
    request.query = { includeArchived: "true" };
  }
  return apiGet<PlatformProduct[]>("/api/v1/platform/products", request);
}

export function patchPlatformProduct(
  productCode: string,
  payload: Partial<{ name: string; description: string | null; status: string }>,
): Promise<PlatformProduct> {
  return apiSend<PlatformProduct>(
    `/api/v1/platform/products/${encodeURIComponent(productCode)}`,
    "PATCH",
    payload,
  );
}

export function listPlatformModules(options?: {
  productCode?: string;
  includeArchived?: boolean;
}): Promise<PlatformModule[]> {
  const request: ApiRequestOptions = {};
  const query: Record<string, string> = {};
  if (options?.productCode) query.productCode = options.productCode;
  if (options?.includeArchived) query.includeArchived = "true";
  if (Object.keys(query).length > 0) request.query = query;
  return apiGet<PlatformModule[]>("/api/v1/platform/modules", request);
}

export function createPlatformModule(
  productCode: string,
  payload: {
    code: string;
    name: string;
    description?: string | null;
    category?: string;
    classification?: string;
    implementationStatus?: string;
    customerAssignable?: boolean;
    displayOrder?: number;
    isCore?: boolean;
  },
): Promise<PlatformModule> {
  return apiSend<PlatformModule>(
    `/api/v1/platform/products/${encodeURIComponent(productCode)}/modules`,
    "POST",
    payload,
  );
}

export function patchPlatformModule(
  productCode: string,
  moduleCode: string,
  payload: Partial<{
    name: string;
    description: string | null;
    category: string;
    classification: string;
    implementationStatus: string;
    customerAssignable: boolean;
    displayOrder: number;
    isCore: boolean;
    status: string;
  }>,
): Promise<PlatformModule> {
  return apiSend<PlatformModule>(
    `/api/v1/platform/products/${encodeURIComponent(productCode)}/modules/${encodeURIComponent(moduleCode)}`,
    "PATCH",
    payload,
  );
}

export function archivePlatformModule(
  productCode: string,
  moduleCode: string,
): Promise<PlatformModule> {
  return apiSend<PlatformModule>(
    `/api/v1/platform/products/${encodeURIComponent(productCode)}/modules/${encodeURIComponent(moduleCode)}`,
    "DELETE",
  );
}

export function listBillingInvoices(tenantId: string): Promise<BillingInvoice[]> {
  return apiGet<BillingInvoice[]>(`/api/v1/tenants/${tenantId}/billing/invoices`);
}

export function createBillingInvoice(
  tenantId: string,
  payload: {
    status?: string;
    currency?: string;
    amountDueCents?: number;
    amountPaidCents?: number;
    externalInvoiceId?: string | null;
    hostedInvoiceUrl?: string | null;
    subscriptionId?: string | null;
    orderId?: string | null;
  },
): Promise<BillingInvoice> {
  return apiSend<BillingInvoice>(`/api/v1/tenants/${tenantId}/billing/invoices`, "POST", payload);
}

export function patchBillingInvoice(
  tenantId: string,
  invoiceId: string,
  payload: Partial<{
    status: string;
    currency: string;
    amountDueCents: number;
    amountPaidCents: number;
    externalInvoiceId: string | null;
    hostedInvoiceUrl: string | null;
  }>,
  ifMatch: string,
): Promise<BillingInvoice> {
  return apiSend<BillingInvoice>(
    `/api/v1/tenants/${tenantId}/billing/invoices/${invoiceId}`,
    "PATCH",
    payload,
    { ifMatch },
  );
}

export function listBillingFees(tenantId: string): Promise<BillingFeeLine[]> {
  return apiGet<BillingFeeLine[]>(`/api/v1/tenants/${tenantId}/billing/fees`);
}

export function createBillingFee(
  tenantId: string,
  payload: {
    feeType: string;
    amountCents: number;
    currency?: string;
    description?: string | null;
    contractId?: string | null;
    orderId?: string | null;
  },
): Promise<BillingFeeLine> {
  return apiSend<BillingFeeLine>(`/api/v1/tenants/${tenantId}/billing/fees`, "POST", payload);
}

export function getBillingOverview(tenantId: string): Promise<BillingOverview> {
  return apiGet<BillingOverview>(`/api/v1/tenants/${tenantId}/billing/overview`);
}

export function createBillingContract(
  tenantId: string,
  payload: {
    name: string;
    status?: string;
    billingType?: string;
    startsOn?: string | null;
    endsOn?: string | null;
    renewalOn?: string | null;
    notes?: string | null;
    setupFeeCents?: number | null;
    pricingJson?: BillingContract["pricingJson"];
  },
): Promise<BillingContract> {
  return apiSend<BillingContract>(`/api/v1/tenants/${tenantId}/billing/contracts`, "POST", payload);
}

export function patchBillingContract(
  tenantId: string,
  contractId: string,
  payload: Partial<{
    name: string;
    status: string;
    billingType: string;
    startsOn: string | null;
    endsOn: string | null;
    renewalOn: string | null;
    notes: string | null;
    setupFeeCents: number | null;
    pricingJson: BillingContract["pricingJson"];
  }>,
  ifMatch: string,
): Promise<BillingContract> {
  return apiSend<BillingContract>(
    `/api/v1/tenants/${tenantId}/billing/contracts/${contractId}`,
    "PATCH",
    payload,
    { ifMatch },
  );
}

// ---------------------------------------------------------------------------
// Platform health
// ---------------------------------------------------------------------------

export type HealthPayload = {
  status: string;
  service: string;
  environment: string;
  version: string;
  timestamp: string;
};

export type ReadyPayload = {
  status: string;
  service: string;
  checks: { database: boolean };
  timestamp: string;
};

export async function fetchHealth(): Promise<HealthPayload> {
  const res = await apiFetchRaw("/health");
  if (!res.ok) {
    throw new Error(`Health check failed: ${res.status}`);
  }
  return (await res.json()) as HealthPayload;
}

export async function fetchReady(): Promise<ReadyPayload | null> {
  const res = await apiFetchRaw("/ready");
  if (res.status === 503) {
    const body = (await res.json()) as ReadyPayload;
    return body;
  }
  if (!res.ok) {
    return null;
  }
  return (await res.json()) as ReadyPayload;
}

export function toIfMatch(recordVersion: number): string {
  return `W/"${recordVersion}"`;
}
