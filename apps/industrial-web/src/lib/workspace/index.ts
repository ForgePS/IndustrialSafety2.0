export type {
  WorkspaceWidgetSize,
  WorkspaceModuleDefinition,
  WorkspaceLayoutItem,
  WorkspaceLayoutState,
  WorkspaceItemPolicy,
  WorkspaceDefaultItem,
  WorkspaceTenantDefaults,
} from "./types";

export {
  WORKSPACE_WIDGET_SIZES,
  WORKSPACE_SIZE_LABELS,
  WORKSPACE_VIEW_LABELS,
  WORKSPACE_ITEM_POLICIES,
  WORKSPACE_POLICY_LABELS,
} from "./types";

export {
  workspaceColumnSpan,
  workspaceRowSpan,
  workspaceMinHeight,
  clampWorkspaceSize,
  isWorkspaceWidgetSize,
} from "./sizing";

export { buildWorkspaceRegistry, getWorkspaceModuleDefinition } from "./registry";

export {
  getModuleSummaryLoader,
  getModuleSummaryDefaultView,
  isSummaryWidgetModule,
} from "./module-summary-loaders";
export type {
  ModuleSummaryPayload,
  ModuleSummaryRow,
  ModuleSummaryStat,
} from "./module-summary-loaders";

export {
  WORKSPACE_LAYOUT_STORAGE_KEY,
  workspaceLayoutStorageKey,
  defaultWorkspaceLayout,
  resolveWorkspaceLayout,
  loadWorkspaceLayout,
  writeWorkspaceLayout,
  clearWorkspaceLayout,
  updateWorkspaceItem,
  resetWorkspaceItem,
  reorderWorkspaceItems,
  moveWorkspaceItem,
  visibleWorkspaceItems,
} from "./layout";

export {
  WORKSPACE_TENANT_DEFAULTS_STORAGE_KEY,
  WORKSPACE_ROLE_PRESETS,
  loadTenantWorkspaceDefaults,
  writeTenantWorkspaceDefaults,
  layoutFromDefaultItems,
  selectEffectiveDefaultItems,
  inferWorkspaceRoleCodes,
  enforceWorkspacePolicies,
  canUserHideModule,
  canUserAddModule,
} from "./tenant-defaults";
