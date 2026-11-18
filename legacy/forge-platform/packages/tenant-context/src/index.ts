export type AuthProvider = "COGNITO";

/**
 * Resolved request principal. Never serialize the full object to clients.
 */
export interface ForgePrincipal {
  authenticationIdentityId: string;
  userId: string;
  personId: string | null;
  tenantId: string;
  organizationIds: string[];
  permissions: ReadonlySet<string>;
  activeProducts: ReadonlySet<string>;
  activeModules: ReadonlySet<string>;
  correlationId: string;
  requestId: string;
  authProvider: AuthProvider;
  isPlatformAdmin: boolean;
}

export interface TenantOperationalState {
  tenantStatus: string;
  subscriptionStatus: string | null;
  canAuthenticate: boolean;
  canUseProducts: boolean;
  canManageBilling: boolean;
  reasonCode: string | null;
}

export function hasPermission(principal: ForgePrincipal, code: string): boolean {
  return principal.permissions.has(code);
}

export function hasAnyPermission(principal: ForgePrincipal, codes: string[]): boolean {
  return codes.some((code) => principal.permissions.has(code));
}

export function hasAllPermissions(principal: ForgePrincipal, codes: string[]): boolean {
  return codes.every((code) => principal.permissions.has(code));
}

export function hasProduct(principal: ForgePrincipal, productCode: string): boolean {
  if (principal.isPlatformAdmin) return true;
  return principal.activeProducts.has(productCode);
}

export function hasModule(principal: ForgePrincipal, moduleCode: string): boolean {
  if (principal.isPlatformAdmin) return true;
  return principal.activeModules.has(moduleCode);
}
