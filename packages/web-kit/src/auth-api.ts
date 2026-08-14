import { apiGet, apiSend, type ApiRequestOptions } from "./api-client.js";

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
  /** MEMBER for ordinary tenants; PLATFORM_ADMIN_SUPPORT for platform admin context. */
  accessMode?: "MEMBER" | "PLATFORM_ADMIN_SUPPORT";
  tenants: AuthTenant[];
};

export function authMe(options?: ApiRequestOptions): Promise<AuthMe> {
  return apiGet<AuthMe>("/api/v1/auth/me", options);
}

export function selectTenant(
  tenantId: string,
  options?: { productCode?: string; reason?: string } & ApiRequestOptions,
): Promise<AuthMe> {
  const { productCode, reason, ...request } = options ?? {};
  return apiSend<AuthMe>(
    "/api/v1/auth/select-tenant",
    "POST",
    {
      tenantId,
      ...(productCode ? { productCode } : {}),
      ...(reason ? { reason } : {}),
    },
    request,
  );
}

export function logoutAll(): Promise<{ sessionVersion: number }> {
  return apiSend<{ sessionVersion: number }>("/api/v1/auth/logout-all", "POST");
}

export type EffectiveFeature = {
  key: string;
  name: string;
  value: unknown;
  valueType: string;
  /** True when a tenant/org/user override set the value (vs. the definition default). */
  overridden?: boolean;
};

export function listEffectiveFeatures(tenantId: string): Promise<EffectiveFeature[]> {
  return apiGet<EffectiveFeature[]>(`/api/v1/tenants/${tenantId}/features/effective`);
}
