/**
 * Configuration-driven navigation for Forge apps (Sneat layout independent).
 * Visibility filters are client-side UX only — backend authorization remains authoritative.
 */

export interface ForgeNavigationItem {
  id: string;
  label: string;
  route: string;
  icon?: string;
  permission?: string;
  /** Any of these permissions grants visibility when set. */
  anyOfPermissions?: readonly string[];
  /** Product code required (e.g. FORGE_INDUSTRIAL). */
  entitlement?: string;
  /** Module code required in addition to any product entitlement. */
  moduleEntitlement?: string;
  featureFlag?: string;
  children?: ForgeNavigationItem[];
}

export interface ForgeNavigationGroup {
  id: string;
  label: string;
  items: ForgeNavigationItem[];
}

export interface ForgeNavigationContext {
  permissions?: ReadonlySet<string> | readonly string[];
  products?: ReadonlySet<string> | readonly string[];
  modules?: ReadonlySet<string> | readonly string[];
  featureFlags?: Readonly<Record<string, boolean>>;
  /** Platform super-admin bypasses permission checks in the UI layer. */
  isPlatformAdmin?: boolean;
}

function asSet(value?: ReadonlySet<string> | readonly string[]): Set<string> {
  if (!value) return new Set();
  return value instanceof Set ? new Set(value) : new Set(value);
}

function hasPermission(
  ctx: ForgeNavigationContext,
  code: string | undefined,
  anyOf: readonly string[] | undefined,
): boolean {
  if (ctx.isPlatformAdmin) return true;
  const perms = asSet(ctx.permissions);
  if (code && !perms.has(code)) return false;
  if (anyOf && anyOf.length > 0 && !anyOf.some((p) => perms.has(p))) return false;
  return true;
}

function isVisible(item: ForgeNavigationItem, ctx: ForgeNavigationContext): boolean {
  if (!hasPermission(ctx, item.permission, item.anyOfPermissions)) return false;
  if (item.entitlement) {
    const products = asSet(ctx.products);
    if (!ctx.isPlatformAdmin && !products.has(item.entitlement)) return false;
  }
  if (item.moduleEntitlement) {
    const modules = asSet(ctx.modules);
    if (!ctx.isPlatformAdmin && !modules.has(item.moduleEntitlement)) return false;
  }
  if (item.featureFlag && ctx.featureFlags && !ctx.featureFlags[item.featureFlag]) {
    return false;
  }
  return true;
}

/** Filter a flat item list for the current auth / entitlement / flag context. */
export function filterNavigationItems(
  items: readonly ForgeNavigationItem[],
  ctx: ForgeNavigationContext,
): ForgeNavigationItem[] {
  const out: ForgeNavigationItem[] = [];
  for (const item of items) {
    if (!isVisible(item, ctx)) continue;
    const children = item.children ? filterNavigationItems(item.children, ctx) : undefined;
    if (item.children && (!children || children.length === 0) && !item.route) {
      continue;
    }
    out.push(children ? { ...item, children } : item);
  }
  return out;
}

/** Filter grouped navigation; empty groups are omitted. */
export function filterNavigationGroups(
  groups: readonly ForgeNavigationGroup[],
  ctx: ForgeNavigationContext,
): ForgeNavigationGroup[] {
  return groups
    .map((group) => ({
      ...group,
      items: filterNavigationItems(group.items, ctx),
    }))
    .filter((group) => group.items.length > 0);
}

export interface ForgeProductConfig {
  id: string;
  name: string;
  shortName: string;
  productCode?: string;
  navigation: ForgeNavigationGroup[];
}

export const forgeStatusColors = {
  operational: "var(--forge-color-success)",
  degraded: "var(--forge-color-warning)",
  warning: "var(--forge-color-warning)",
  offline: "var(--forge-color-danger)",
  unknown: "var(--forge-color-secondary)",
  active: "var(--forge-color-success)",
  onboarding: "var(--forge-color-info)",
  suspended: "var(--forge-color-warning)",
  migration: "var(--forge-color-info)",
  archived: "var(--forge-color-secondary)",
} as const;
