/**
 * Tenant / role default workspace layouts (Phase 5).
 * Stored per-tenant in localStorage until a server prefs API exists.
 */

import { clampWorkspaceSize, isWorkspaceWidgetSize } from "./sizing";
import type {
  WorkspaceDefaultItem,
  WorkspaceItemPolicy,
  WorkspaceLayoutItem,
  WorkspaceLayoutState,
  WorkspaceModuleDefinition,
  WorkspaceTenantDefaults,
  WorkspaceWidgetSize,
} from "./types";
import { WORKSPACE_ITEM_POLICIES } from "./types";

export const WORKSPACE_TENANT_DEFAULTS_STORAGE_KEY = "forge-ind-workspace-tenant-defaults-v1";

export const WORKSPACE_ROLE_PRESETS = [
  { code: "INDUSTRIAL_EMPLOYEE", label: "Employee" },
  { code: "INDUSTRIAL_SUPERVISOR", label: "Supervisor" },
  { code: "INDUSTRIAL_SAFETY_MANAGER", label: "EHS / Safety Manager" },
  { code: "INDUSTRIAL_FLEET_MANAGER", label: "Fleet Manager" },
] as const;

export type WorkspaceRolePresetCode = (typeof WORKSPACE_ROLE_PRESETS)[number]["code"];

export function workspaceTenantDefaultsStorageKey(tenantId: string): string {
  return `${WORKSPACE_TENANT_DEFAULTS_STORAGE_KEY}:${tenantId}`;
}

export function isWorkspaceItemPolicy(value: unknown): value is WorkspaceItemPolicy {
  return typeof value === "string" && (WORKSPACE_ITEM_POLICIES as readonly string[]).includes(value);
}

function normalizeDefaultItem(
  raw: unknown,
  sortOrder: number,
  definition?: WorkspaceModuleDefinition,
): WorkspaceDefaultItem | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const moduleKey = typeof row.moduleKey === "string" ? row.moduleKey : "";
  if (!moduleKey) return null;
  const sizeRaw = row.size;
  const size: WorkspaceWidgetSize = isWorkspaceWidgetSize(sizeRaw) ? sizeRaw : "compact";
  const supported = definition?.supportedSizes ?? (["compact"] as WorkspaceWidgetSize[]);
  const policy: WorkspaceItemPolicy = isWorkspaceItemPolicy(row.policy) ? row.policy : "default";
  const defaultView =
    typeof row.defaultView === "string" ? row.defaultView : definition?.defaultView;
  return {
    moduleKey,
    sortOrder: typeof row.sortOrder === "number" ? row.sortOrder : sortOrder,
    size: clampWorkspaceSize(size, supported),
    policy,
    ...(defaultView ? { defaultView } : {}),
    ...(row.sizeLocked === true ? { sizeLocked: true } : {}),
  };
}

/** Spec starter layouts used when seeding role tabs / Apply starter. */
export function starterRoleDefaultKeys(roleCode: string): string[] {
  switch (roleCode) {
    case "INDUSTRIAL_EMPLOYEE":
      return ["CALENDAR", "TASKS", "REMINDERS", "TRAINING", "FORMS"];
    case "INDUSTRIAL_SUPERVISOR":
      return ["CALENDAR", "TASKS", "REMINDERS", "INSPECTIONS", "PERSONNEL", "TRAINING"];
    case "INDUSTRIAL_SAFETY_MANAGER":
      return [
        "CALENDAR",
        "TASKS",
        "REMINDERS",
        "INCIDENTS",
        "INSPECTIONS",
        "CORRECTIVE_ACTIONS",
        "TRAINING",
        "ANALYTICS",
        "REPORTING",
      ];
    case "INDUSTRIAL_FLEET_MANAGER":
      return [
        "CALENDAR",
        "TASKS",
        "REMINDERS",
        "FLEET",
        "INSPECTIONS",
        "DOT_COMPLIANCE",
        "REPORTING",
      ];
    default:
      return ["CALENDAR", "TASKS", "REMINDERS"];
  }
}

export function buildDefaultsFromKeys(
  keys: readonly string[],
  registry: readonly WorkspaceModuleDefinition[],
  options?: { requiredKeys?: readonly string[]; policyForRest?: WorkspaceItemPolicy },
): WorkspaceDefaultItem[] {
  const byKey = new Map(registry.map((mod) => [mod.key, mod]));
  const required = new Set(options?.requiredKeys ?? ["CALENDAR", "TASKS", "REMINDERS"]);
  const restPolicy = options?.policyForRest ?? "optional";
  const items: WorkspaceDefaultItem[] = [];
  const seen = new Set<string>();

  for (const key of keys) {
    const mod = byKey.get(key);
    if (!mod || seen.has(key)) continue;
    seen.add(key);
    items.push({
      moduleKey: key,
      sortOrder: items.length,
      size: mod.widgetEnabled && key !== "CALENDAR" && key !== "TASKS" && key !== "REMINDERS"
        ? mod.defaultSize
        : mod.key === "CALENDAR" || mod.key === "TASKS" || mod.key === "REMINDERS"
          ? "medium"
          : mod.defaultSize,
      policy: required.has(key) ? "required" : "default",
      ...(mod.defaultView ? { defaultView: mod.defaultView } : {}),
    });
  }

  for (const mod of registry) {
    if (seen.has(mod.key)) continue;
    items.push({
      moduleKey: mod.key,
      sortOrder: items.length,
      size: mod.defaultSize,
      policy: restPolicy,
      ...(mod.defaultView ? { defaultView: mod.defaultView } : {}),
    });
  }

  return items;
}

export function emptyTenantDefaults(
  registry: readonly WorkspaceModuleDefinition[],
): WorkspaceTenantDefaults {
  const baseKeys = registry.map((m) => m.key);
  return {
    version: 1,
    items: buildDefaultsFromKeys(baseKeys, registry, {
      requiredKeys: ["CALENDAR", "TASKS", "REMINDERS"],
      policyForRest: "default",
    }),
    roleDefaults: {},
  };
}

export function readTenantWorkspaceDefaults(tenantId: string): WorkspaceTenantDefaults | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(workspaceTenantDefaultsStorageKey(tenantId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const state = parsed as WorkspaceTenantDefaults;
    if (state.version !== 1 || !Array.isArray(state.items)) return null;
    return state;
  } catch {
    return null;
  }
}

export function writeTenantWorkspaceDefaults(
  tenantId: string,
  state: WorkspaceTenantDefaults,
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      workspaceTenantDefaultsStorageKey(tenantId),
      JSON.stringify(state),
    );
  } catch {
    // ignore
  }
}

export function clearTenantWorkspaceDefaults(tenantId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(workspaceTenantDefaultsStorageKey(tenantId));
  } catch {
    // ignore
  }
}

export function resolveTenantWorkspaceDefaults(
  stored: WorkspaceTenantDefaults | null,
  registry: readonly WorkspaceModuleDefinition[],
): WorkspaceTenantDefaults {
  if (registry.length === 0) {
    return { version: 1, items: [], roleDefaults: {} };
  }
  const byKey = new Map(registry.map((mod) => [mod.key, mod]));
  const baseSource = stored?.items?.length ? stored.items : emptyTenantDefaults(registry).items;

  const items: WorkspaceDefaultItem[] = [];
  const seen = new Set<string>();
  for (const raw of [...baseSource].sort((a, b) => a.sortOrder - b.sortOrder)) {
    const normalized = normalizeDefaultItem(raw, items.length, byKey.get(raw.moduleKey));
    if (!normalized || !byKey.has(normalized.moduleKey) || seen.has(normalized.moduleKey)) continue;
    seen.add(normalized.moduleKey);
    items.push({ ...normalized, sortOrder: items.length });
  }
  for (const mod of registry) {
    if (seen.has(mod.key)) continue;
    items.push({
      moduleKey: mod.key,
      sortOrder: items.length,
      size: mod.defaultSize,
      policy: "optional",
      ...(mod.defaultView ? { defaultView: mod.defaultView } : {}),
    });
  }

  const roleDefaults: Record<string, WorkspaceDefaultItem[]> = {};
  for (const [roleCode, roleItems] of Object.entries(stored?.roleDefaults ?? {})) {
    const next: WorkspaceDefaultItem[] = [];
    const roleSeen = new Set<string>();
    for (const raw of [...roleItems].sort((a, b) => a.sortOrder - b.sortOrder)) {
      const normalized = normalizeDefaultItem(raw, next.length, byKey.get(raw.moduleKey));
      if (!normalized || !byKey.has(normalized.moduleKey) || roleSeen.has(normalized.moduleKey)) {
        continue;
      }
      roleSeen.add(normalized.moduleKey);
      next.push({ ...normalized, sortOrder: next.length });
    }
    for (const mod of registry) {
      if (roleSeen.has(mod.key)) continue;
      next.push({
        moduleKey: mod.key,
        sortOrder: next.length,
        size: mod.defaultSize,
        policy: "optional",
        ...(mod.defaultView ? { defaultView: mod.defaultView } : {}),
      });
    }
    roleDefaults[roleCode] = next;
  }

  return { version: 1, items, roleDefaults };
}

export function loadTenantWorkspaceDefaults(
  tenantId: string,
  registry: readonly WorkspaceModuleDefinition[],
): WorkspaceTenantDefaults {
  return resolveTenantWorkspaceDefaults(readTenantWorkspaceDefaults(tenantId), registry);
}

/**
 * Infer which role preset(s) apply from permissions when membership roles
 * are not available on AuthMe.
 */
export function inferWorkspaceRoleCodes(
  permissions: readonly string[],
  isPlatformAdmin = false,
): string[] {
  const set = new Set<string>(["INDUSTRIAL_EMPLOYEE"]);
  const perms = new Set(permissions);
  if (isPlatformAdmin || perms.has("industrial.admin")) {
    set.add("INDUSTRIAL_SAFETY_MANAGER");
  }
  if (perms.has("industrial.fleet.manage")) {
    set.add("INDUSTRIAL_FLEET_MANAGER");
  }
  // Heuristic: inspection managers often act as supervisors
  if (perms.has("industrial.inspections.manage") || perms.has("industrial.personnel.manage")) {
    set.add("INDUSTRIAL_SUPERVISOR");
  }
  return [...set];
}

const ROLE_PRIORITY: string[] = [
  "INDUSTRIAL_SAFETY_MANAGER",
  "INDUSTRIAL_FLEET_MANAGER",
  "INDUSTRIAL_SUPERVISOR",
  "INDUSTRIAL_EMPLOYEE",
];

/** Pick the highest-priority configured role overlay, else base tenant items. */
export function selectEffectiveDefaultItems(
  defaults: WorkspaceTenantDefaults,
  roleCodes: readonly string[],
): WorkspaceDefaultItem[] {
  for (const code of ROLE_PRIORITY) {
    if (!roleCodes.includes(code)) continue;
    const overlay = defaults.roleDefaults[code];
    if (overlay && overlay.length > 0) return overlay;
  }
  return defaults.items;
}

export function policyMapFromDefaults(
  items: readonly WorkspaceDefaultItem[],
): Map<string, WorkspaceItemPolicy> {
  return new Map(items.map((item) => [item.moduleKey, item.policy]));
}

export function sizeLockedSet(items: readonly WorkspaceDefaultItem[]): Set<string> {
  return new Set(items.filter((item) => Boolean(item.sizeLocked)).map((i) => i.moduleKey));
}

export function layoutFromDefaultItems(
  items: readonly WorkspaceDefaultItem[],
  registry: readonly WorkspaceModuleDefinition[],
): WorkspaceLayoutState {
  const byKey = new Map(registry.map((mod) => [mod.key, mod]));
  const layoutItems: WorkspaceLayoutItem[] = [];

  for (const item of [...items].sort((a, b) => a.sortOrder - b.sortOrder)) {
    const mod = byKey.get(item.moduleKey);
    if (!mod) continue;
    if (item.policy === "hidden") {
      layoutItems.push({
        moduleKey: item.moduleKey,
        sortOrder: layoutItems.length,
        size: clampWorkspaceSize(item.size, mod.supportedSizes),
        isVisible: false,
        ...(item.defaultView ? { defaultView: item.defaultView } : {}),
      });
      continue;
    }
    const visible = item.policy === "required" || item.policy === "default";
    layoutItems.push({
      moduleKey: item.moduleKey,
      sortOrder: layoutItems.length,
      size: clampWorkspaceSize(item.size, mod.supportedSizes),
      isVisible: visible,
      ...(item.defaultView ? { defaultView: item.defaultView } : {}),
    });
  }

  return { version: 1, items: layoutItems };
}

/** Force required visible and hidden not visible. */
export function enforceWorkspacePolicies(
  layout: WorkspaceLayoutState,
  policies: Map<string, WorkspaceItemPolicy>,
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

export function canUserHideModule(
  moduleKey: string,
  policies: Map<string, WorkspaceItemPolicy>,
): boolean {
  return policies.get(moduleKey) !== "required";
}

export function canUserAddModule(
  moduleKey: string,
  policies: Map<string, WorkspaceItemPolicy>,
): boolean {
  const policy = policies.get(moduleKey);
  return policy !== "hidden";
}

export function canUserResizeModule(
  moduleKey: string,
  defaults: readonly WorkspaceDefaultItem[],
): boolean {
  const item = defaults.find((row) => row.moduleKey === moduleKey);
  return !item?.sizeLocked;
}
