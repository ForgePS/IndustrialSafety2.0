import type { AuthMe } from "./auth-api.js";
import { clearCachedAuthMe } from "./auth-storage.js";

/**
 * Server-verified tenant switch with local persistence rollback on failure.
 * Always replaces the AuthMe summary on success so prior tenant capabilities
 * cannot linger in client memory.
 */
export async function switchActiveTenant(input: {
  tenantId: string;
  previousTenantId: string | null;
  selectTenant: (
    tenantId: string,
    options?: { productCode?: string; reason?: string },
  ) => Promise<AuthMe>;
  setActiveTenantId: (tenantId: string) => void;
  clearActiveTenantId: () => void;
  productCode?: string;
  reason?: string;
}): Promise<AuthMe> {
  // Drop prior-tenant /auth/me cache before binding the new tenant id.
  // Keep previous x-tenant-id until select-tenant succeeds so AuthGuard resolves
  // against the current context, not the not-yet-selected tenant.
  clearCachedAuthMe();
  try {
    const updated = await input.selectTenant(input.tenantId, {
      ...(input.productCode ? { productCode: input.productCode } : {}),
      ...(input.reason ? { reason: input.reason } : {}),
    });
    input.setActiveTenantId(input.tenantId);
    return updated;
  } catch (error) {
    if (input.previousTenantId) {
      input.setActiveTenantId(input.previousTenantId);
    } else {
      input.clearActiveTenantId();
    }
    throw error;
  }
}
