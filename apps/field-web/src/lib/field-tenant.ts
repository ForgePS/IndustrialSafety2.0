/**
 * Detect the platform home tenant (no customer LOTO / industrial data).
 */
export function isPlatformHomeTenant(tenant: {
  slug?: string | null;
  displayName?: string | null;
} | null | undefined): boolean {
  if (!tenant) return false;
  const slug = String(tenant.slug ?? "")
    .trim()
    .toLowerCase();
  const name = String(tenant.displayName ?? "")
    .trim()
    .toLowerCase();
  return (
    name === "forge platform" ||
    slug === "forge-platform" ||
    slug === "platform" ||
    slug.startsWith("forge-platform")
  );
}

export const FIELD_FORCE_TENANT_PICK_KEY = "forge.field.force-tenant-pick";

export function readForceTenantPick(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(FIELD_FORCE_TENANT_PICK_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeForceTenantPick(force: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (force) sessionStorage.setItem(FIELD_FORCE_TENANT_PICK_KEY, "1");
    else sessionStorage.removeItem(FIELD_FORCE_TENANT_PICK_KEY);
  } catch {
    // ignore
  }
}
