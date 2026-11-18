/**
 * Product / module entitlements (FORGE-SAAS MK-S5).
 * Permission ≠ subscription — both are required for paid capabilities (ADR-017).
 */

export const PLATFORM_PRODUCT_CODES = [
  "FORGE_ACADEMY",
  "FORGE_RMS",
  "FORGE_INDUSTRIAL",
  "FORGE_CREATOR",
] as const;

export type PlatformProductCode = (typeof PLATFORM_PRODUCT_CODES)[number];

export const PLATFORM_PRODUCT_CATALOG: ReadonlyArray<{
  code: PlatformProductCode;
  name: string;
}> = [
  { code: "FORGE_ACADEMY", name: "Forge Academy" },
  { code: "FORGE_RMS", name: "Forge RMS" },
  { code: "FORGE_INDUSTRIAL", name: "Forge Industrial Safety" },
  { code: "FORGE_CREATOR", name: "Forge Creator" },
] as const;

export interface EntitlementSnapshot {
  products: string[];
  modules: string[];
}

export type EntitlementSetLike = readonly string[] | ReadonlySet<string> | null | undefined;

function setHas(source: EntitlementSetLike, code: string): boolean {
  if (!source) return false;
  if (source instanceof Set) return source.has(code);
  return (source as readonly string[]).includes(code);
}

export function getEntitlements(input: {
  activeProducts?: EntitlementSetLike;
  activeModules?: EntitlementSetLike;
}): EntitlementSnapshot {
  const products =
    input.activeProducts instanceof Set
      ? [...input.activeProducts]
      : [...(input.activeProducts ?? [])];
  const modules =
    input.activeModules instanceof Set
      ? [...input.activeModules]
      : [...(input.activeModules ?? [])];
  return { products, modules };
}

/** Alias for session/tenant product list from a snapshot. */
export function getTenantProducts(snapshot: EntitlementSnapshot): string[] {
  return snapshot.products;
}

/** Alias for session/tenant module list from a snapshot. */
export function getTenantModules(snapshot: EntitlementSnapshot): string[] {
  return snapshot.modules;
}

export function isProductEnabled(
  activeProducts: EntitlementSetLike,
  productCode: string,
  options?: { isPlatformAdmin?: boolean },
): boolean {
  if (options?.isPlatformAdmin) return true;
  return setHas(activeProducts, productCode);
}

export function isModuleEnabled(
  activeModules: EntitlementSetLike,
  moduleCode: string,
  options?: { isPlatformAdmin?: boolean },
): boolean {
  if (options?.isPlatformAdmin) return true;
  return setHas(activeModules, moduleCode);
}

/**
 * Time-window filter for module entitlement rows (status already ACTIVE/GRACE).
 * Missing bounds are treated as open-ended.
 */
export function isModuleEntitlementWithinWindow(
  row: { startsAt?: Date | string | null; endsAt?: Date | string | null },
  now: Date = new Date(),
): boolean {
  if (row.startsAt) {
    const starts = row.startsAt instanceof Date ? row.startsAt : new Date(row.startsAt);
    if (Number.isFinite(starts.getTime()) && starts.getTime() > now.getTime()) {
      return false;
    }
  }
  if (row.endsAt) {
    const ends = row.endsAt instanceof Date ? row.endsAt : new Date(row.endsAt);
    if (Number.isFinite(ends.getTime()) && ends.getTime() <= now.getTime()) {
      return false;
    }
  }
  return true;
}

export function isPlatformProductCode(value: string): value is PlatformProductCode {
  return (PLATFORM_PRODUCT_CODES as readonly string[]).includes(value);
}
