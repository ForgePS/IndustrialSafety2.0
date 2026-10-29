/**
 * Forge My Workspace — layout and widget size model (Phase 1 framework).
 */

export type WorkspaceWidgetSize = "compact" | "medium" | "wide" | "large" | "full";

export const WORKSPACE_WIDGET_SIZES: readonly WorkspaceWidgetSize[] = [
  "compact",
  "medium",
  "wide",
  "large",
  "full",
] as const;

export const WORKSPACE_SIZE_LABELS: Record<WorkspaceWidgetSize, string> = {
  compact: "Compact",
  medium: "Medium",
  wide: "Wide",
  large: "Large",
  full: "Full Width",
};

/** Tenant policy for a workspace item (Phase 5). */
export type WorkspaceItemPolicy = "required" | "default" | "optional" | "hidden";

export const WORKSPACE_ITEM_POLICIES: readonly WorkspaceItemPolicy[] = [
  "required",
  "default",
  "optional",
  "hidden",
] as const;

export const WORKSPACE_POLICY_LABELS: Record<WorkspaceItemPolicy, string> = {
  required: "Required",
  default: "Default",
  optional: "Optional",
  hidden: "Hidden",
};

export type WorkspaceModuleDefinition = {
  key: string;
  label: string;
  route: string;
  icon: string;
  widgetEnabled: boolean;
  supportedSizes: WorkspaceWidgetSize[];
  supportedViews?: string[];
  defaultSize: WorkspaceWidgetSize;
  defaultView?: string;
  /** Size applied by the quick-expand control. */
  expandSize?: WorkspaceWidgetSize;
};

export type WorkspaceLayoutItem = {
  moduleKey: string;
  sortOrder: number;
  size: WorkspaceWidgetSize;
  defaultView?: string;
  isVisible: boolean;
  settings?: Record<string, unknown>;
};

export type WorkspaceLayoutState = {
  version: 1;
  items: WorkspaceLayoutItem[];
};

export type WorkspaceDefaultItem = {
  moduleKey: string;
  sortOrder: number;
  size: WorkspaceWidgetSize;
  defaultView?: string;
  policy: WorkspaceItemPolicy;
  /** When true, users cannot change size. */
  sizeLocked?: boolean;
};

export type WorkspaceTenantDefaults = {
  version: 1;
  items: WorkspaceDefaultItem[];
  /** Optional overlays keyed by industrial role code. */
  roleDefaults: Record<string, WorkspaceDefaultItem[]>;
};

export const WORKSPACE_VIEW_LABELS: Record<string, string> = {
  today: "Today",
  "3-day": "Next 3 Days",
  week: "Week",
  month: "Month",
  "my-tasks": "My Tasks",
  overdue: "Overdue",
  "assigned-to-me": "Assigned to Me",
  "assigned-by-me": "Assigned by Me",
  upcoming: "Upcoming",
  sent: "Sent",
  all: "All",
  open: "Open",
  due: "Due",
  assigned: "Assigned",
  "due-soon": "Due Soon",
  approvals: "Approvals",
  mine: "My Acks",
  active: "Active",
  recent: "Recent",
  unread: "Unread",
  "low-stock": "Low Stock",
  requests: "Requests",
};
