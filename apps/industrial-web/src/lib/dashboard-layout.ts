/**
 * Per-user Industrial dashboard block layout (Attention, Upcoming, Workspace, etc.).
 */

import type { WorkspaceWidgetSize } from "@/lib/workspace/types";
import {
  clampWorkspaceSize,
  isWorkspaceWidgetSize,
  workspaceColumnSpan,
} from "@/lib/workspace/sizing";

export const DASHBOARD_LAYOUT_STORAGE_KEY = "forge-ind-dashboard-layout-v1";

/** Dispatched by the theme gear panel to enter dashboard customize mode. */
export const CUSTOMIZE_DASHBOARD_EVENT = "forge:customize-dashboard";
export const CUSTOMIZE_DASHBOARD_FLAG = "forge.customizeDashboard";

export function requestCustomizeDashboard() {
  if (typeof window === "undefined") return;
  const onHome =
    window.location.pathname === "/" ||
    window.location.pathname === "" ||
    window.location.pathname.endsWith("/index.html");
  if (onHome) {
    window.dispatchEvent(new Event(CUSTOMIZE_DASHBOARD_EVENT));
    return;
  }
  try {
    sessionStorage.setItem(CUSTOMIZE_DASHBOARD_FLAG, "1");
  } catch {
    /* ignore quota / private mode */
  }
  window.location.assign("/");
}

export type DashboardBlockId =
  | "attention"
  | "upcoming-events"
  | "upcoming-tasks"
  | "upcoming-reminders"
  | "workspace"
  | "insight-trend"
  | "insight-history"
  | "insight-safety"
  | "insight-tasks"
  | "insight-inspections"
  | "body-map";

export type DashboardBlockDefinition = {
  id: DashboardBlockId;
  label: string;
  /** Sizes the block may use on the 6-col grid. */
  supportedSizes: readonly WorkspaceWidgetSize[];
  defaultSize: WorkspaceWidgetSize;
  /** For saved layouts that predate this block: place it after this block instead of last. */
  insertAfter?: DashboardBlockId;
};

export type DashboardLayoutItem = {
  id: DashboardBlockId;
  sortOrder: number;
  size: WorkspaceWidgetSize;
  isVisible: boolean;
};

export type DashboardLayoutState = {
  version: 1;
  items: DashboardLayoutItem[];
};

export const DASHBOARD_BLOCKS: readonly DashboardBlockDefinition[] = [
  {
    id: "attention",
    label: "What Needs Your Attention",
    supportedSizes: ["wide", "large", "full"],
    defaultSize: "full",
  },
  {
    id: "upcoming-events",
    label: "Upcoming events",
    supportedSizes: ["compact", "medium", "wide", "large"],
    defaultSize: "medium",
  },
  {
    id: "upcoming-tasks",
    label: "Tasks due",
    supportedSizes: ["compact", "medium", "wide", "large"],
    defaultSize: "medium",
  },
  {
    id: "upcoming-reminders",
    label: "Reminders",
    supportedSizes: ["compact", "medium", "wide", "large"],
    defaultSize: "medium",
  },
  {
    id: "workspace",
    label: "My Workspace",
    supportedSizes: ["wide", "large", "full"],
    defaultSize: "full",
  },
  {
    id: "insight-trend",
    label: "Incident trend",
    supportedSizes: ["medium", "wide", "large", "full"],
    defaultSize: "wide",
  },
  {
    id: "insight-history",
    label: "Injury history",
    supportedSizes: ["medium", "wide", "large", "full"],
    defaultSize: "wide",
    insertAfter: "insight-trend",
  },
  {
    id: "insight-safety",
    label: "Safety index",
    supportedSizes: ["compact", "medium", "wide"],
    defaultSize: "medium",
  },
  {
    id: "insight-tasks",
    label: "Task scheduler",
    supportedSizes: ["medium", "wide", "large", "full"],
    defaultSize: "full",
  },
  {
    id: "insight-inspections",
    label: "Inspections by site",
    supportedSizes: ["medium", "wide", "large", "full"],
    defaultSize: "full",
  },
  {
    id: "body-map",
    label: "Injury body map",
    supportedSizes: ["medium", "wide", "large", "full"],
    defaultSize: "full",
  },
] as const;

const BY_ID = new Map(DASHBOARD_BLOCKS.map((b) => [b.id, b]));

export function getDashboardBlock(id: string): DashboardBlockDefinition | undefined {
  return BY_ID.get(id as DashboardBlockId);
}

export function dashboardLayoutStorageKey(tenantId: string, userId: string): string {
  return `${DASHBOARD_LAYOUT_STORAGE_KEY}:${tenantId}:${userId}`;
}

export function defaultDashboardLayout(
  available: ReadonlySet<DashboardBlockId>,
): DashboardLayoutState {
  const items: DashboardLayoutItem[] = [];
  for (const def of DASHBOARD_BLOCKS) {
    if (!available.has(def.id)) continue;
    items.push({
      id: def.id,
      sortOrder: items.length,
      size: def.defaultSize,
      isVisible: true,
    });
  }
  return { version: 1, items };
}

export function resolveDashboardLayout(
  stored: DashboardLayoutState | null,
  available: ReadonlySet<DashboardBlockId>,
): DashboardLayoutState {
  if (available.size === 0) return { version: 1, items: [] };
  if (!stored || stored.version !== 1 || !Array.isArray(stored.items)) {
    return defaultDashboardLayout(available);
  }

  const seen = new Set<DashboardBlockId>();
  const items: DashboardLayoutItem[] = [];
  const ordered = [...stored.items].sort((a, b) => a.sortOrder - b.sortOrder);

  for (const raw of ordered) {
    if (!available.has(raw.id) || seen.has(raw.id)) continue;
    const def = getDashboardBlock(raw.id);
    if (!def) continue;
    const size = isWorkspaceWidgetSize(raw.size) ? raw.size : def.defaultSize;
    items.push({
      id: raw.id,
      sortOrder: items.length,
      size: clampWorkspaceSize(size, def.supportedSizes),
      isVisible: raw.isVisible !== false,
    });
    seen.add(raw.id);
  }

  for (const def of DASHBOARD_BLOCKS) {
    if (!available.has(def.id) || seen.has(def.id)) continue;
    const item = { id: def.id, sortOrder: 0, size: def.defaultSize, isVisible: true };
    const after = def.insertAfter ? items.findIndex((i) => i.id === def.insertAfter) : -1;
    if (after >= 0) items.splice(after + 1, 0, item);
    else items.push(item);
    seen.add(def.id);
  }

  return { version: 1, items: items.map((item, index) => ({ ...item, sortOrder: index })) };
}

export function loadDashboardLayout(
  tenantId: string,
  userId: string,
  available: ReadonlySet<DashboardBlockId>,
): DashboardLayoutState {
  if (typeof window === "undefined") return defaultDashboardLayout(available);
  try {
    const raw = window.localStorage.getItem(dashboardLayoutStorageKey(tenantId, userId));
    if (!raw) return defaultDashboardLayout(available);
    return resolveDashboardLayout(JSON.parse(raw) as DashboardLayoutState, available);
  } catch {
    return defaultDashboardLayout(available);
  }
}

export function writeDashboardLayout(
  tenantId: string,
  userId: string,
  state: DashboardLayoutState,
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(dashboardLayoutStorageKey(tenantId, userId), JSON.stringify(state));
  } catch {
    /* ignore quota */
  }
}

export function clearDashboardLayout(tenantId: string, userId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(dashboardLayoutStorageKey(tenantId, userId));
  } catch {
    /* ignore */
  }
}

export function visibleDashboardItems(state: DashboardLayoutState): DashboardLayoutItem[] {
  return state.items.filter((item) => item.isVisible).sort((a, b) => a.sortOrder - b.sortOrder);
}

export function updateDashboardItem(
  state: DashboardLayoutState,
  id: DashboardBlockId,
  patch: Partial<Pick<DashboardLayoutItem, "size" | "isVisible">>,
): DashboardLayoutState {
  const def = getDashboardBlock(id);
  return {
    version: 1,
    items: state.items.map((item) => {
      if (item.id !== id) return item;
      const next = { ...item, ...patch };
      if (patch.size && def) {
        next.size = clampWorkspaceSize(patch.size, def.supportedSizes);
      }
      return next;
    }),
  };
}

export function reorderDashboardItems(
  state: DashboardLayoutState,
  orderedIds: readonly DashboardBlockId[],
): DashboardLayoutState {
  const byId = new Map(state.items.map((item) => [item.id, item]));
  const items: DashboardLayoutItem[] = [];
  const seen = new Set<DashboardBlockId>();

  for (const id of orderedIds) {
    const item = byId.get(id);
    if (!item || seen.has(id)) continue;
    seen.add(id);
    items.push({ ...item, sortOrder: items.length });
  }
  for (const item of state.items) {
    if (seen.has(item.id)) continue;
    items.push({ ...item, sortOrder: items.length });
  }
  return { version: 1, items };
}

export function moveDashboardItem(
  state: DashboardLayoutState,
  id: DashboardBlockId,
  direction: "up" | "down" | "top" | "bottom",
): DashboardLayoutState {
  const visible = visibleDashboardItems(state).map((item) => item.id);
  const index = visible.indexOf(id);
  if (index < 0) return state;
  const next = [...visible];
  if (direction === "up" && index > 0) {
    [next[index - 1], next[index]] = [next[index]!, next[index - 1]!];
  } else if (direction === "down" && index < next.length - 1) {
    [next[index], next[index + 1]] = [next[index + 1]!, next[index]!];
  } else if (direction === "top") {
    next.splice(index, 1);
    next.unshift(id);
  } else if (direction === "bottom") {
    next.splice(index, 1);
    next.push(id);
  } else {
    return state;
  }
  const hidden = state.items
    .filter((item) => !item.isVisible)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((item) => item.id);
  return reorderDashboardItems(state, [...next, ...hidden]);
}

export function dashboardBlockSpan(size: WorkspaceWidgetSize): number {
  return workspaceColumnSpan(size);
}
