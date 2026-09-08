import { readDashboardQuickLinkCodes } from "@/lib/dashboard-quick-links";
import { clampWorkspaceSize, isWorkspaceWidgetSize } from "./sizing";
import type { WorkspaceLayoutItem, WorkspaceLayoutState, WorkspaceModuleDefinition, WorkspaceWidgetSize } from "./types";

export const WORKSPACE_LAYOUT_STORAGE_KEY = "forge-ind-workspace-layout-v1";

export function workspaceLayoutStorageKey(tenantId: string, userId: string): string {
  return `${WORKSPACE_LAYOUT_STORAGE_KEY}:${tenantId}:${userId}`;
}

function emptyLayout(): WorkspaceLayoutState {
  return { version: 1, items: [] };
}

function normalizeItem(
  raw: unknown,
  definition: WorkspaceModuleDefinition | undefined,
  sortOrder: number,
): WorkspaceLayoutItem | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const moduleKey = typeof row.moduleKey === "string" ? row.moduleKey : "";
  if (!moduleKey) return null;

  const sizeRaw = row.size;
  const size: WorkspaceWidgetSize = isWorkspaceWidgetSize(sizeRaw) ? sizeRaw : "compact";
  const supported = definition?.supportedSizes ?? (["compact"] as WorkspaceWidgetSize[]);
  const defaultView =
    typeof row.defaultView === "string"
      ? row.defaultView
      : definition?.defaultView;

  return {
    moduleKey,
    sortOrder: typeof row.sortOrder === "number" ? row.sortOrder : sortOrder,
    size: clampWorkspaceSize(size, supported),
    ...(defaultView ? { defaultView } : {}),
    isVisible: row.isVisible !== false,
    ...(row.settings && typeof row.settings === "object"
      ? { settings: row.settings as Record<string, unknown> }
      : {}),
  };
}

export function defaultWorkspaceLayout(
  registry: readonly WorkspaceModuleDefinition[],
): WorkspaceLayoutState {
  return {
    version: 1,
    items: registry.map((mod, index) => ({
      moduleKey: mod.key,
      sortOrder: index,
      size: mod.defaultSize,
      ...(mod.defaultView ? { defaultView: mod.defaultView } : {}),
      isVisible: true,
    })),
  };
}

/**
 * Resolve stored layout against the current registry: drop unauthorized modules,
 * clamp sizes/views, and append newly available modules as visible compact cards.
 */
export function resolveWorkspaceLayout(
  stored: WorkspaceLayoutState | null,
  registry: readonly WorkspaceModuleDefinition[],
): WorkspaceLayoutState {
  if (registry.length === 0) return emptyLayout();
  const byKey = new Map(registry.map((mod) => [mod.key, mod]));

  if (!stored || stored.version !== 1 || !Array.isArray(stored.items)) {
    return defaultWorkspaceLayout(registry);
  }

  const seen = new Set<string>();
  const items: WorkspaceLayoutItem[] = [];

  const ordered = [...stored.items].sort((a, b) => a.sortOrder - b.sortOrder);
  for (const raw of ordered) {
    const definition = byKey.get(raw.moduleKey);
    if (!definition || seen.has(raw.moduleKey)) continue;
    const normalized = normalizeItem(raw, definition, items.length);
    if (!normalized) continue;
    if (definition.supportedViews?.length && normalized.defaultView) {
      if (!definition.supportedViews.includes(normalized.defaultView)) {
        const fallbackView = definition.defaultView;
        if (fallbackView !== undefined) {
          normalized.defaultView = fallbackView;
        } else {
          delete normalized.defaultView;
        }
      }
    }
    seen.add(raw.moduleKey);
    items.push({ ...normalized, sortOrder: items.length });
  }

  for (const mod of registry) {
    if (seen.has(mod.key)) continue;
    items.push({
      moduleKey: mod.key,
      sortOrder: items.length,
      size: mod.defaultSize,
      ...(mod.defaultView ? { defaultView: mod.defaultView } : {}),
      isVisible: true,
    });
  }

  if (items.filter((item) => item.isVisible).length === 0) {
    return defaultWorkspaceLayout(registry);
  }

  return { version: 1, items };
}

export function readWorkspaceLayout(tenantId: string, userId: string): WorkspaceLayoutState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(workspaceLayoutStorageKey(tenantId, userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const state = parsed as WorkspaceLayoutState;
    if (state.version !== 1 || !Array.isArray(state.items)) return null;
    return state;
  } catch {
    return null;
  }
}

export function writeWorkspaceLayout(
  tenantId: string,
  userId: string,
  state: WorkspaceLayoutState,
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(workspaceLayoutStorageKey(tenantId, userId), JSON.stringify(state));
  } catch {
    // ignore quota / private mode
  }
}

export function clearWorkspaceLayout(tenantId: string, userId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(workspaceLayoutStorageKey(tenantId, userId));
  } catch {
    // ignore
  }
}

/**
 * Migrate legacy quick-link pin order into a workspace layout when no layout
 * has been saved yet.
 */
export function migrateFromQuickLinks(
  tenantId: string,
  userId: string,
  registry: readonly WorkspaceModuleDefinition[],
): WorkspaceLayoutState | null {
  const codes = readDashboardQuickLinkCodes(tenantId, userId);
  if (!codes) return null;
  const byKey = new Map(registry.map((mod) => [mod.key, mod]));
  const items: WorkspaceLayoutItem[] = [];
  const seen = new Set<string>();

  for (const code of codes) {
    const mod = byKey.get(code);
    if (!mod || seen.has(code)) continue;
    seen.add(code);
    items.push({
      moduleKey: code,
      sortOrder: items.length,
      size: mod.defaultSize,
      ...(mod.defaultView ? { defaultView: mod.defaultView } : {}),
      isVisible: true,
    });
  }

  for (const mod of registry) {
    if (seen.has(mod.key)) continue;
    items.push({
      moduleKey: mod.key,
      sortOrder: items.length,
      size: mod.defaultSize,
      ...(mod.defaultView ? { defaultView: mod.defaultView } : {}),
      isVisible: false,
    });
  }

  if (items.filter((item) => item.isVisible).length === 0) return null;
  return { version: 1, items };
}

export function loadWorkspaceLayout(
  tenantId: string,
  userId: string,
  registry: readonly WorkspaceModuleDefinition[],
  options?: {
    tenantDefaults?: WorkspaceLayoutState | null;
    policies?: Map<string, import("./types").WorkspaceItemPolicy>;
  },
): WorkspaceLayoutState {
  const stored = readWorkspaceLayout(tenantId, userId);
  if (stored) {
    const resolved = resolveWorkspaceLayout(stored, registry);
    return options?.policies ? enforcePoliciesInline(resolved, options.policies) : resolved;
  }

  const migrated = migrateFromQuickLinks(tenantId, userId, registry);
  if (migrated) {
    const resolved = resolveWorkspaceLayout(migrated, registry);
    const enforced = options?.policies ? enforcePoliciesInline(resolved, options.policies) : resolved;
    writeWorkspaceLayout(tenantId, userId, enforced);
    return enforced;
  }

  if (options?.tenantDefaults) {
    const resolved = resolveWorkspaceLayout(options.tenantDefaults, registry);
    const enforced = options?.policies ? enforcePoliciesInline(resolved, options.policies) : resolved;
    writeWorkspaceLayout(tenantId, userId, enforced);
    return enforced;
  }

  return defaultWorkspaceLayout(registry);
}

function enforcePoliciesInline(
  layout: WorkspaceLayoutState,
  policies: Map<string, import("./types").WorkspaceItemPolicy>,
): WorkspaceLayoutState {
  if (policies.size === 0) return layout;
  return {
    version: 1,
    items: layout.items.map((item) => {
      const policy = policies.get(item.moduleKey);
      if (policy === "required") return { ...item, isVisible: true };
      if (policy === "hidden") return { ...item, isVisible: false };
      return item;
    }),
  };
}

export function updateWorkspaceItem(
  state: WorkspaceLayoutState,
  moduleKey: string,
  patch: Partial<Pick<WorkspaceLayoutItem, "size" | "defaultView" | "isVisible" | "settings">>,
  registry: readonly WorkspaceModuleDefinition[],
): WorkspaceLayoutState {
  const definition = registry.find((mod) => mod.key === moduleKey);
  const items = state.items.map((item) => {
    if (item.moduleKey !== moduleKey) return item;
    const next: WorkspaceLayoutItem = { ...item, ...patch };
    if (patch.size && definition) {
      next.size = clampWorkspaceSize(patch.size, definition.supportedSizes);
    }
    if (patch.defaultView && definition?.supportedViews?.length) {
      if (!definition.supportedViews.includes(patch.defaultView)) {
        const fallbackView = definition.defaultView;
        if (fallbackView !== undefined) {
          next.defaultView = fallbackView;
        } else {
          delete next.defaultView;
        }
      }
    }
    if ("settings" in patch && patch.settings === undefined) {
      delete next.settings;
    }
    return next;
  });
  return { version: 1, items };
}

export function resetWorkspaceItem(
  state: WorkspaceLayoutState,
  moduleKey: string,
  registry: readonly WorkspaceModuleDefinition[],
): WorkspaceLayoutState {
  const definition = registry.find((mod) => mod.key === moduleKey);
  if (!definition) return state;
  const items = state.items.map((item) => {
    if (item.moduleKey !== moduleKey) return item;
    const next: WorkspaceLayoutItem = {
      moduleKey: item.moduleKey,
      sortOrder: item.sortOrder,
      size: definition.defaultSize,
      isVisible: item.isVisible,
      ...(definition.defaultView ? { defaultView: definition.defaultView } : {}),
    };
    return next;
  });
  return { version: 1, items };
}

export function reorderWorkspaceItems(
  state: WorkspaceLayoutState,
  orderedKeys: readonly string[],
): WorkspaceLayoutState {
  const byKey = new Map(state.items.map((item) => [item.moduleKey, item]));
  const items: WorkspaceLayoutItem[] = [];
  const seen = new Set<string>();

  for (const key of orderedKeys) {
    const item = byKey.get(key);
    if (!item || seen.has(key)) continue;
    seen.add(key);
    items.push({ ...item, sortOrder: items.length });
  }
  for (const item of state.items) {
    if (seen.has(item.moduleKey)) continue;
    items.push({ ...item, sortOrder: items.length });
  }
  return { version: 1, items };
}

export function moveWorkspaceItem(
  state: WorkspaceLayoutState,
  moduleKey: string,
  direction: "up" | "down" | "top" | "bottom",
): WorkspaceLayoutState {
  const visible = state.items
    .filter((item) => item.isVisible)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((item) => item.moduleKey);
  const index = visible.indexOf(moduleKey);
  if (index < 0) return state;

  const next = [...visible];
  if (direction === "up" && index > 0) {
    [next[index - 1], next[index]] = [next[index]!, next[index - 1]!];
  } else if (direction === "down" && index < next.length - 1) {
    [next[index], next[index + 1]] = [next[index + 1]!, next[index]!];
  } else if (direction === "top") {
    next.splice(index, 1);
    next.unshift(moduleKey);
  } else if (direction === "bottom") {
    next.splice(index, 1);
    next.push(moduleKey);
  } else {
    return state;
  }

  const hidden = state.items
    .filter((item) => !item.isVisible)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((item) => item.moduleKey);

  return reorderWorkspaceItems(state, [...next, ...hidden]);
}

export function visibleWorkspaceItems(
  state: WorkspaceLayoutState,
): WorkspaceLayoutItem[] {
  return state.items
    .filter((item) => item.isVisible)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}
