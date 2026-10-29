import type {
  DashboardPreferencesState,
  DashboardWidgetDefinition,
  WidgetPreference,
  WidgetSize,
} from "./types";

const STORAGE_KEY = "fx.rms.dashboard.preferences.v1";

export function defaultPreferences(
  widgets: DashboardWidgetDefinition[],
): DashboardPreferencesState {
  return {
    version: 1,
    widgets: widgets.map((widget) => ({
      id: widget.id,
      visible: widget.defaultVisible,
      size: widget.defaultSize,
      order: widget.defaultOrder,
    })),
  };
}

export function loadDashboardPreferences(
  widgets: DashboardWidgetDefinition[],
): DashboardPreferencesState {
  const defaults = defaultPreferences(widgets);
  if (typeof window === "undefined") return defaults;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as DashboardPreferencesState;
    if (parsed.version !== 1 || !Array.isArray(parsed.widgets)) return defaults;
    const byId = new Map(parsed.widgets.map((item) => [item.id, item]));
    return {
      version: 1,
      widgets: widgets.map((widget) => {
        const saved = byId.get(widget.id);
        return {
          id: widget.id,
          visible: saved?.visible ?? widget.defaultVisible,
          size: (saved?.size as WidgetSize | undefined) ?? widget.defaultSize,
          order: saved?.order ?? widget.defaultOrder,
        };
      }),
    };
  } catch {
    return defaults;
  }
}

export function saveDashboardPreferences(state: DashboardPreferencesState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore quota / private mode
  }
}

export function mergePreferences(
  widgets: DashboardWidgetDefinition[],
  preferences: DashboardPreferencesState,
): WidgetPreference[] {
  const byId = new Map(preferences.widgets.map((item) => [item.id, item]));
  return widgets
    .map((widget) => {
      const saved = byId.get(widget.id);
      return {
        id: widget.id,
        visible: saved?.visible ?? widget.defaultVisible,
        size: saved?.size ?? widget.defaultSize,
        order: saved?.order ?? widget.defaultOrder,
      };
    })
    .sort((a, b) => a.order - b.order);
}
