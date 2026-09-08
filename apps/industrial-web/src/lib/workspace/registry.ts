import type { WorkspaceModuleDefinition, WorkspaceWidgetSize } from "./types";

type ModuleSeed = {
  code: string;
  name: string;
  route: string;
};

type WidgetOverride = Partial<
  Pick<
    WorkspaceModuleDefinition,
    | "widgetEnabled"
    | "supportedSizes"
    | "supportedViews"
    | "defaultSize"
    | "defaultView"
    | "expandSize"
  >
>;

const COMPACT_ONLY: WorkspaceWidgetSize[] = ["compact"];

const PRIMARY_WIDGET_SIZES: WorkspaceWidgetSize[] = [
  "compact",
  "medium",
  "wide",
  "large",
  "full",
];

/**
 * Per-module widget capabilities. Modules not listed stay compact launchers
 * until a later phase enables live content for them.
 */
const SUMMARY_WIDGET_SIZES: WorkspaceWidgetSize[] = [
  "compact",
  "medium",
  "wide",
  "large",
];

const SUMMARY_BASE: WidgetOverride = {
  widgetEnabled: true,
  supportedSizes: SUMMARY_WIDGET_SIZES,
  defaultSize: "compact",
  expandSize: "large",
};

const WIDGET_OVERRIDES: Record<string, WidgetOverride> = {
  CALENDAR: {
    widgetEnabled: true,
    supportedSizes: PRIMARY_WIDGET_SIZES,
    supportedViews: ["today", "3-day", "week", "month"],
    defaultSize: "compact",
    defaultView: "3-day",
    expandSize: "large",
  },
  TASKS: {
    widgetEnabled: true,
    supportedSizes: ["compact", "medium", "wide", "large"],
    supportedViews: ["my-tasks", "today", "week", "overdue", "assigned-to-me", "assigned-by-me"],
    defaultSize: "compact",
    defaultView: "today",
    expandSize: "large",
  },
  REMINDERS: {
    widgetEnabled: true,
    supportedSizes: ["compact", "medium", "wide", "large"],
    supportedViews: ["today", "upcoming", "sent", "overdue", "all"],
    defaultSize: "compact",
    defaultView: "upcoming",
    expandSize: "large",
  },
  /** Phase 6 — shared summary widgets */
  INSPECTIONS: {
    ...SUMMARY_BASE,
    supportedViews: ["open", "due", "all"],
    defaultView: "open",
  },
  TRAINING: {
    ...SUMMARY_BASE,
    supportedViews: ["assigned", "due-soon", "overdue"],
    defaultView: "assigned",
  },
  DOCUMENTS: {
    ...SUMMARY_BASE,
    supportedViews: ["overdue", "approvals", "mine"],
    defaultView: "overdue",
  },
  EMERGENCY_ALERTS: {
    ...SUMMARY_BASE,
    supportedViews: ["active", "recent"],
    defaultView: "active",
  },
  MESSAGING: {
    ...SUMMARY_BASE,
    supportedViews: ["unread", "recent"],
    defaultView: "unread",
  },
  SAFETY_SUPPLIES: {
    ...SUMMARY_BASE,
    supportedViews: ["low-stock", "requests"],
    defaultView: "low-stock",
  },
  CORRECTIVE_ACTIONS: {
    ...SUMMARY_BASE,
    supportedViews: ["open", "overdue", "all"],
    defaultView: "open",
  },
};

/**
 * Build workspace module definitions from the user's available Industrial nav
 * modules plus widget overrides for live-capable modules.
 */
export function buildWorkspaceRegistry(
  modules: readonly ModuleSeed[],
  iconForCode: (code: string) => string,
): WorkspaceModuleDefinition[] {
  return modules.map((mod) => {
    const override = WIDGET_OVERRIDES[mod.code] ?? {};
    const supportedSizes = override.supportedSizes ?? COMPACT_ONLY;
    const defaultSize = override.defaultSize ?? "compact";
    return {
      key: mod.code,
      label: mod.name,
      route: mod.route,
      icon: iconForCode(mod.code),
      widgetEnabled: override.widgetEnabled ?? false,
      supportedSizes,
      ...(override.supportedViews ? { supportedViews: override.supportedViews } : {}),
      defaultSize: supportedSizes.includes(defaultSize) ? defaultSize : (supportedSizes[0] ?? "compact"),
      ...(override.defaultView ? { defaultView: override.defaultView } : {}),
      ...(override.expandSize ? { expandSize: override.expandSize } : {}),
    };
  });
}

export function getWorkspaceModuleDefinition(
  registry: readonly WorkspaceModuleDefinition[],
  key: string,
): WorkspaceModuleDefinition | undefined {
  return registry.find((entry) => entry.key === key);
}
