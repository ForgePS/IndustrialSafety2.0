import {
  dashboardCardById,
  defaultDashboardPinnedIds,
  FIELD_DASHBOARD_CATALOG,
  type DashboardCard,
} from "@/lib/dashboard-cards";
import {
  hasFieldAccess,
  hasFieldPermission,
  type FieldAuthOpts,
} from "@/lib/field-permissions";
import { isFieldFeatureModuleEnabled } from "@/lib/field-modules";

const STORAGE_KEY = "forge.field.dashboard.v1";

export type DashboardLayout = {
  pinnedIds: string[];
};

export type DashboardCardOpts = FieldAuthOpts & {
  activeModules?: readonly string[];
};

export function canUseDashboardCard(
  card: DashboardCard,
  permissions: readonly string[],
  opts?: DashboardCardOpts,
): boolean {
  if (opts?.isPlatformAdmin) return true;
  if (
    !isFieldFeatureModuleEnabled(opts?.activeModules, card.id, {
      isPlatformAdmin: Boolean(opts?.isPlatformAdmin),
    })
  ) {
    return false;
  }
  // More-section links (no permission) stay available to every signed-in user.
  if (!card.permission) return true;
  return hasFieldPermission(permissions, card.permission, opts) || hasFieldAccess(permissions, opts);
}

export function normalizePinnedIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return defaultDashboardPinnedIds();
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== "string") continue;
    const id = entry.trim();
    if (!id || seen.has(id) || !dashboardCardById(id)) continue;
    seen.add(id);
    normalized.push(id);
  }
  return normalized.length > 0 ? normalized : defaultDashboardPinnedIds();
}

export function readDashboardLayout(): DashboardLayout {
  if (typeof window === "undefined") {
    return { pinnedIds: defaultDashboardPinnedIds() };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { pinnedIds: defaultDashboardPinnedIds() };
    const parsed = JSON.parse(raw) as { pinnedIds?: unknown };
    return { pinnedIds: normalizePinnedIds(parsed.pinnedIds) };
  } catch {
    return { pinnedIds: defaultDashboardPinnedIds() };
  }
}

export function writeDashboardLayout(layout: DashboardLayout): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ pinnedIds: normalizePinnedIds(layout.pinnedIds) }),
  );
}

export function resolvePinnedCards(
  pinnedIds: readonly string[],
  permissions: readonly string[],
  opts?: DashboardCardOpts,
): DashboardCard[] {
  return normalizePinnedIds([...pinnedIds])
    .map((id) => dashboardCardById(id))
    .filter((card): card is DashboardCard =>
      Boolean(card && canUseDashboardCard(card, permissions, opts)),
    );
}

export function listAddableCards(
  pinnedIds: readonly string[],
  permissions: readonly string[],
  opts?: DashboardCardOpts,
): DashboardCard[] {
  const pinned = new Set(normalizePinnedIds([...pinnedIds]));
  return FIELD_DASHBOARD_CATALOG.filter(
    (card) => !pinned.has(card.id) && canUseDashboardCard(card, permissions, opts),
  );
}

export function movePinnedId(ids: readonly string[], id: string, direction: "up" | "down"): string[] {
  const next = [...ids];
  const index = next.indexOf(id);
  if (index < 0) return next;
  const swapWith = direction === "up" ? index - 1 : index + 1;
  if (swapWith < 0 || swapWith >= next.length) return next;
  const current = next[index];
  const target = next[swapWith];
  if (current === undefined || target === undefined) return next;
  next[index] = target;
  next[swapWith] = current;
  return next;
}

export function pinCard(ids: readonly string[], id: string): string[] {
  if (!dashboardCardById(id)) return [...ids];
  const next = ids.filter((entry) => entry !== id);
  next.push(id);
  return next;
}

export function unpinCard(ids: readonly string[], id: string): string[] {
  const next = ids.filter((entry) => entry !== id);
  return next.length > 0 ? next : defaultDashboardPinnedIds();
}
