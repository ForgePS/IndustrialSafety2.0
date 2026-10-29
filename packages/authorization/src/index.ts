import { READABLE_SUBSCRIPTION_STATUSES, WRITABLE_SUBSCRIPTION_STATUSES } from "@forge/contracts";
import type { ForgePrincipal, TenantOperationalState } from "@forge/tenant-context";

export type PermissionEffect = "ALLOW" | "DENY";

export interface AuthorizationInput {
  principal: ForgePrincipal;
  permissionCode: string;
  resourceType: string;
  resourceTenantId: string;
  resourceOrganizationId?: string | null;
  tenantOperationalState: TenantOperationalState;
  roleEffects: Array<{ effect: PermissionEffect; organizationId: string | null }>;
  requiresEntitlement?: { productCode?: string; moduleCode?: string };
  allowWhenSuspended?: boolean;
}

export interface AuthorizationDecision {
  allowed: boolean;
  reasonCode: string;
}

export interface PermissionEffectRow {
  code: string;
  effect: PermissionEffect;
}

/**
 * Union of role permission rows with deny-wins (ADR-015).
 * DENY removes a code even if another role granted ALLOW.
 */
export function resolveEffectivePermissionCodes(
  rows: ReadonlyArray<PermissionEffectRow>,
): Set<string> {
  const allowed = new Set<string>();
  const denied = new Set<string>();
  for (const row of rows) {
    if (row.effect === "DENY") {
      denied.add(row.code);
    } else {
      allowed.add(row.code);
    }
  }
  for (const code of denied) {
    allowed.delete(code);
  }
  return allowed;
}

/** Read permissions stay available in READ_ONLY subscription mode (ADR-019). */
export function isReadPermission(permissionCode: string): boolean {
  return permissionCode.endsWith(".read");
}

function isWritableSubscription(status: string | null): boolean {
  if (status === null) {
    return true;
  }
  return (
    (WRITABLE_SUBSCRIPTION_STATUSES as readonly string[]).includes(status) ||
    status === "TRIAL" ||
    status === "GRACE"
  );
}

function isReadableSubscription(status: string | null): boolean {
  if (status === null) {
    return true;
  }
  return (
    (READABLE_SUBSCRIPTION_STATUSES as readonly string[]).includes(status) ||
    status === "TRIAL" ||
    status === "GRACE"
  );
}

export function evaluateAuthorization(input: AuthorizationInput): AuthorizationDecision {
  const { principal, tenantOperationalState } = input;

  if (principal.tenantId !== input.resourceTenantId && !principal.isPlatformAdmin) {
    return { allowed: false, reasonCode: "TENANT_MISMATCH" };
  }

  if (!tenantOperationalState.canAuthenticate && !principal.isPlatformAdmin) {
    return {
      allowed: false,
      reasonCode: tenantOperationalState.reasonCode ?? "TENANT_INACTIVE",
    };
  }

  if (
    tenantOperationalState.reasonCode === "TENANT_SUSPENDED" &&
    !input.allowWhenSuspended &&
    !principal.isPlatformAdmin
  ) {
    return { allowed: false, reasonCode: "TENANT_SUSPENDED" };
  }

  const subscriptionStatus = tenantOperationalState.subscriptionStatus;
  const subscriptionReadable = isReadableSubscription(subscriptionStatus);
  const needsWriteAccess = !isReadPermission(input.permissionCode);

  if (needsWriteAccess) {
    if (
      !tenantOperationalState.canUseProducts &&
      !input.allowWhenSuspended &&
      !principal.isPlatformAdmin
    ) {
      return {
        allowed: false,
        reasonCode: tenantOperationalState.reasonCode ?? "TENANT_OR_SUBSCRIPTION_INACTIVE",
      };
    }
  } else if (!subscriptionReadable && !input.allowWhenSuspended && !principal.isPlatformAdmin) {
    return {
      allowed: false,
      reasonCode: tenantOperationalState.reasonCode ?? "SUBSCRIPTION_INACTIVE",
    };
  }

  if (input.requiresEntitlement?.productCode) {
    if (
      !principal.activeProducts.has(input.requiresEntitlement.productCode) &&
      !principal.isPlatformAdmin
    ) {
      return { allowed: false, reasonCode: "PRODUCT_ENTITLEMENT_REQUIRED" };
    }
  }
  if (input.requiresEntitlement?.moduleCode) {
    if (
      !principal.activeModules.has(input.requiresEntitlement.moduleCode) &&
      !principal.isPlatformAdmin
    ) {
      return { allowed: false, reasonCode: "MODULE_ENTITLEMENT_REQUIRED" };
    }
  }

  if (principal.isPlatformAdmin || principal.permissions.has(input.permissionCode)) {
    // Still apply explicit deny from roleEffects
  } else if (!principal.permissions.has(input.permissionCode)) {
    return { allowed: false, reasonCode: "PERMISSION_MISSING" };
  }

  const scoped = input.roleEffects.filter((effect) => {
    if (!effect.organizationId) return true;
    if (!input.resourceOrganizationId) return true;
    return effect.organizationId === input.resourceOrganizationId;
  });

  if (scoped.some((e) => e.effect === "DENY")) {
    return { allowed: false, reasonCode: "EXPLICIT_DENY" };
  }

  if (principal.isPlatformAdmin || principal.permissions.has(input.permissionCode)) {
    return { allowed: true, reasonCode: "ALLOW" };
  }

  if (scoped.some((e) => e.effect === "ALLOW")) {
    return { allowed: true, reasonCode: "ALLOW" };
  }

  return { allowed: false, reasonCode: "PERMISSION_MISSING" };
}

export function evaluateTenantOperationalState(input: {
  tenantStatus: string;
  subscriptionStatus: string | null;
}): TenantOperationalState {
  const tenantProductEligible = input.tenantStatus === "ACTIVE" || input.tenantStatus === "TRIAL";
  const subscriptionWritable = isWritableSubscription(input.subscriptionStatus);

  if (input.tenantStatus === "SUSPENDED") {
    return {
      tenantStatus: input.tenantStatus,
      subscriptionStatus: input.subscriptionStatus,
      canAuthenticate: true,
      canUseProducts: false,
      canManageBilling: true,
      reasonCode: "TENANT_SUSPENDED",
    };
  }

  if (
    input.tenantStatus === "ARCHIVED" ||
    input.tenantStatus === "CANCELED" ||
    input.tenantStatus === "DECOMMISSIONED"
  ) {
    return {
      tenantStatus: input.tenantStatus,
      subscriptionStatus: input.subscriptionStatus,
      canAuthenticate: false,
      canUseProducts: false,
      canManageBilling: false,
      reasonCode: "TENANT_INACTIVE",
    };
  }

  if (!subscriptionWritable) {
    return {
      tenantStatus: input.tenantStatus,
      subscriptionStatus: input.subscriptionStatus,
      canAuthenticate: true,
      canUseProducts: false,
      canManageBilling: true,
      reasonCode: "SUBSCRIPTION_INACTIVE",
    };
  }

  return {
    tenantStatus: input.tenantStatus,
    subscriptionStatus: input.subscriptionStatus,
    canAuthenticate: tenantProductEligible || input.tenantStatus === "PROVISIONING",
    canUseProducts: tenantProductEligible && subscriptionWritable,
    canManageBilling: true,
    reasonCode: null,
  };
}

export function resolveFeatureValue<T>(layers: {
  user?: T;
  organization?: T;
  tenant?: T;
  global?: T;
  defaultValue: T;
}): T {
  if (layers.user !== undefined) return layers.user;
  if (layers.organization !== undefined) return layers.organization;
  if (layers.tenant !== undefined) return layers.tenant;
  if (layers.global !== undefined) return layers.global;
  return layers.defaultValue;
}

/**
 * Product/module entitlement gate independent of permission evaluation.
 * Platform admins bypass both checks.
 */
export function requireEntitlement(
  principal: ForgePrincipal,
  entitlement: { productCode?: string; moduleCode?: string },
): AuthorizationDecision {
  if (entitlement.productCode) {
    if (!principal.activeProducts.has(entitlement.productCode) && !principal.isPlatformAdmin) {
      return { allowed: false, reasonCode: "PRODUCT_ENTITLEMENT_REQUIRED" };
    }
  }
  if (entitlement.moduleCode) {
    if (!principal.activeModules.has(entitlement.moduleCode) && !principal.isPlatformAdmin) {
      return { allowed: false, reasonCode: "MODULE_ENTITLEMENT_REQUIRED" };
    }
  }
  return { allowed: true, reasonCode: "ALLOW" };
}
