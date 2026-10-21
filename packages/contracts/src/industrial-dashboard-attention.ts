/**
 * Home dashboard "What Needs Your Attention" sources mapped to Industrial modules.
 */

import { industrialModuleNavPermissionOk } from "./industrial-module-permissions.js";

export type IndustrialDashboardAttentionSource = {
  key: string;
  moduleCode: string;
  label: string;
  href: string;
};

export const INDUSTRIAL_DASHBOARD_ATTENTION_SOURCES: readonly IndustrialDashboardAttentionSource[] =
  [
    {
      key: "openIncidents",
      moduleCode: "INCIDENTS",
      label: "Open Incidents",
      href: "/modules/incidents?status=OPEN",
    },
    {
      key: "openCorrectiveActions",
      moduleCode: "CORRECTIVE_ACTIONS",
      label: "Open Corrective Actions",
      href: "/modules/corrective-actions?status=OPEN",
    },
    {
      key: "inspectionsDue",
      moduleCode: "INSPECTIONS",
      label: "Inspections Due",
      href: "/modules/inspections?status=OPEN",
    },
    {
      key: "trainingExpiring",
      moduleCode: "TRAINING",
      label: "Training / Certifications Expiring",
      href: "/modules/training",
    },
    {
      key: "observations",
      moduleCode: "OBSERVATIONS",
      label: "Safety Observations",
      href: "/modules/observations",
    },
    {
      key: "lotoReviews",
      moduleCode: "LOCKOUT_TAGOUT",
      label: "LOTO Reviews Due",
      href: "/modules/loto",
    },
    {
      key: "workersComp",
      moduleCode: "WORKERS_COMP",
      label: "Workers' Comp Open Cases",
      href: "/modules/workers-comp?status=OPEN",
    },
    {
      key: "workersCompWeeklyUpdates",
      moduleCode: "WORKERS_COMP",
      label: "Workers' Comp Weekly Updates Due",
      href: "/modules/workers-comp/?view=weekly-updates",
    },
    {
      key: "tasks",
      moduleCode: "TASKS",
      label: "Open Tasks",
      href: "/modules/tasks",
    },
    {
      key: "missingMvrConsent",
      moduleCode: "PERSONNEL",
      label: "MVR Consent required",
      href: "/modules/personnel/?view=company-drivers",
    },
  ] as const;

const BY_KEY = new Map(
  INDUSTRIAL_DASHBOARD_ATTENTION_SOURCES.map((row) => [row.key, row]),
);

export function industrialDashboardAttentionSource(
  key: string,
): IndustrialDashboardAttentionSource | undefined {
  return BY_KEY.get(key);
}

/**
 * Whether the principal may see a dashboard attention card for a module.
 * Requires module entitlement (activeModules) and nav permission for that module.
 */
export function industrialDashboardAttentionAllowed(input: {
  moduleCode: string;
  permissions: ReadonlySet<string> | readonly string[];
  activeModules?: ReadonlySet<string> | readonly string[] | null;
  isPlatformAdmin?: boolean;
}): boolean {
  if (input.isPlatformAdmin) return true;
  const permissions =
    input.permissions instanceof Set ? input.permissions : new Set(input.permissions);
  if (permissions.has("industrial.admin")) return true;

  const modules =
    input.activeModules == null
      ? null
      : input.activeModules instanceof Set
        ? input.activeModules
        : new Set(input.activeModules);
  if (modules && modules.size > 0 && !modules.has(input.moduleCode)) {
    return false;
  }

  return industrialModuleNavPermissionOk(input.moduleCode, permissions);
}

export function filterIndustrialDashboardAttentionItems<T extends { key: string }>(
  items: readonly T[],
  input: {
    permissions: ReadonlySet<string> | readonly string[];
    activeModules?: ReadonlySet<string> | readonly string[] | null;
    isPlatformAdmin?: boolean;
    /** When set, only modules in this set are considered available (client nav). */
    availableModuleCodes?: ReadonlySet<string> | readonly string[] | null;
  },
): T[] {
  const available =
    input.availableModuleCodes == null
      ? null
      : input.availableModuleCodes instanceof Set
        ? input.availableModuleCodes
        : new Set(input.availableModuleCodes);

  return items.filter((item) => {
    const source = BY_KEY.get(item.key);
    if (!source) return true;
    if (available && !available.has(source.moduleCode)) return false;
    return industrialDashboardAttentionAllowed({
      moduleCode: source.moduleCode,
      permissions: input.permissions,
      ...(input.activeModules !== undefined ? { activeModules: input.activeModules } : {}),
      ...(input.isPlatformAdmin !== undefined
        ? { isPlatformAdmin: input.isPlatformAdmin }
        : {}),
    });
  });
}
