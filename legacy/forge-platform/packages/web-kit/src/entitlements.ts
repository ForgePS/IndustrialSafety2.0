import {
  filterNavigationGroups,
  type ForgeNavigationContext,
  type ForgeNavigationGroup,
} from "@forge/design-system";
import {
  getEntitlements,
  isModuleEnabled,
  isProductEnabled,
  type EntitlementSnapshot,
} from "@forge/contracts";
import type { AuthMe } from "./auth-api.js";

export type SessionEntitlementSource = Pick<
  AuthMe,
  "activeProducts" | "activeModules" | "isPlatformAdmin"
>;

export function sessionProductEnabled(
  me: SessionEntitlementSource | null | undefined,
  productCode: string,
): boolean {
  if (!me) return false;
  return isProductEnabled(me.activeProducts, productCode, {
    isPlatformAdmin: me.isPlatformAdmin,
  });
}

export function sessionModuleEnabled(
  me: SessionEntitlementSource | null | undefined,
  moduleCode: string,
): boolean {
  if (!me) return false;
  return isModuleEnabled(me.activeModules, moduleCode, {
    isPlatformAdmin: me.isPlatformAdmin,
  });
}

export function sessionEntitlements(
  me: SessionEntitlementSource | null | undefined,
): EntitlementSnapshot {
  return getEntitlements({
    activeProducts: me?.activeProducts,
    activeModules: me?.activeModules,
  });
}

/**
 * Filter navigation groups using session permissions + product/module entitlements.
 * Client UX only — server authorization remains authoritative.
 */
export function filterNavigationForSession(
  groups: readonly ForgeNavigationGroup[],
  me: (SessionEntitlementSource & { permissions?: string[] }) | null | undefined,
  extras?: Pick<ForgeNavigationContext, "featureFlags">,
): ForgeNavigationGroup[] {
  return filterNavigationGroups(groups, {
    permissions: me?.permissions ?? [],
    products: me?.activeProducts ?? [],
    modules: me?.activeModules ?? [],
    ...(me?.isPlatformAdmin ? { isPlatformAdmin: true } : {}),
    ...(extras?.featureFlags ? { featureFlags: extras.featureFlags } : {}),
  });
}
