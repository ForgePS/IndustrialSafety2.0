"use client";

export type ThemeModePreference = "light" | "dark" | "system";
export type ThemeSkin = "default" | "bordered";
export type ThemeLayout = "vertical" | "collapsed" | "horizontal";
export type ThemeContentWidth = "compact" | "wide";
export type ThemeDirection = "ltr" | "rtl";

export type IndustrialTemplateSettings = {
  mode: ThemeModePreference;
  primaryColor: string;
  skin: ThemeSkin;
  layout: ThemeLayout;
  contentWidth: ThemeContentWidth;
  direction: ThemeDirection;
};

export const TEMPLATE_SETTINGS_KEY = "forge-ind-template-settings";
export const THEME_MODE_KEY = "forge-ind-theme-mode";
export const TEMPLATE_SETTINGS_EVENT = "forge-ind-template-settings";
/** Opens the theme / dashboard customizer panel (navbar trigger). */
export const OPEN_THEME_CUSTOMIZER_EVENT = "forge:open-theme-customizer";

export function requestOpenThemeCustomizer() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(OPEN_THEME_CUSTOMIZER_EVENT));
}

export const DEFAULT_PRIMARY = "#696CFF";

export const PRIMARY_COLOR_PRESETS = [
  { name: "Purple", main: "#696CFF" },
  { name: "Teal", main: "#0D9394" },
  { name: "Orange", main: "#FFAB1D" },
  { name: "Pink", main: "#EB3D63" },
  { name: "Blue", main: "#2092EC" },
] as const;

export const DEFAULT_TEMPLATE_SETTINGS: IndustrialTemplateSettings = {
  mode: "system",
  primaryColor: DEFAULT_PRIMARY,
  skin: "default",
  layout: "vertical",
  contentWidth: "compact",
  direction: "ltr",
};

export function systemPrefersDark(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(window.matchMedia?.("(prefers-color-scheme: dark)")?.matches);
}

export function resolveThemeMode(preference: ThemeModePreference): "light" | "dark" {
  if (preference === "system") return systemPrefersDark() ? "dark" : "light";
  return preference;
}

function isHexColor(value: string): boolean {
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value.trim());
}

function expandHex(hex: string): string {
  const raw = hex.trim().replace("#", "");
  if (raw.length === 3) {
    return `#${raw
      .split("")
      .map((c) => c + c)
      .join("")}`;
  }
  return `#${raw}`;
}

export function hexToRgbCsv(hex: string): string | null {
  if (!isHexColor(hex)) return null;
  const full = expandHex(hex).slice(1);
  const r = Number.parseInt(full.slice(0, 2), 16);
  const g = Number.parseInt(full.slice(2, 4), 16);
  const b = Number.parseInt(full.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return null;
  return `${r}, ${g}, ${b}`;
}

function migrateLegacyMode(): ThemeModePreference | null {
  if (typeof window === "undefined") return null;
  const legacy = window.localStorage.getItem(THEME_MODE_KEY);
  if (legacy === "light" || legacy === "dark" || legacy === "system") return legacy;
  return null;
}

export function readTemplateSettings(): IndustrialTemplateSettings {
  if (typeof window === "undefined") return { ...DEFAULT_TEMPLATE_SETTINGS };
  try {
    const raw = window.localStorage.getItem(TEMPLATE_SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<IndustrialTemplateSettings>;
      return {
        mode:
          parsed.mode === "light" || parsed.mode === "dark" || parsed.mode === "system"
            ? parsed.mode
            : DEFAULT_TEMPLATE_SETTINGS.mode,
        primaryColor:
          typeof parsed.primaryColor === "string" && isHexColor(parsed.primaryColor)
            ? expandHex(parsed.primaryColor)
            : DEFAULT_TEMPLATE_SETTINGS.primaryColor,
        skin: parsed.skin === "bordered" ? "bordered" : "default",
        layout:
          parsed.layout === "collapsed" || parsed.layout === "horizontal"
            ? parsed.layout
            : "vertical",
        contentWidth: parsed.contentWidth === "wide" ? "wide" : "compact",
        direction: parsed.direction === "rtl" ? "rtl" : "ltr",
      };
    }
  } catch {
    // ignore corrupt storage
  }
  const legacyMode = migrateLegacyMode();
  if (legacyMode) {
    return { ...DEFAULT_TEMPLATE_SETTINGS, mode: legacyMode };
  }
  return { ...DEFAULT_TEMPLATE_SETTINGS };
}

export function writeTemplateSettings(settings: IndustrialTemplateSettings): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TEMPLATE_SETTINGS_KEY, JSON.stringify(settings));
  // Keep legacy key in sync for older FOUC/readers.
  window.localStorage.setItem(THEME_MODE_KEY, settings.mode);
}

export function applyResolvedThemeMode(mode: "light" | "dark"): void {
  const root = document.documentElement;
  root.setAttribute("data-bs-theme", mode);
  root.setAttribute("data-theme", "theme-default");
  root.classList.toggle("light-style", mode === "light");
  root.classList.toggle("dark-style", mode === "dark");
  root.classList.add("layout-menu-fixed");
  root.style.colorScheme = mode;
}

export function applyTemplateSettings(settings: IndustrialTemplateSettings): void {
  const root = document.documentElement;
  const resolvedMode = resolveThemeMode(settings.mode);
  applyResolvedThemeMode(resolvedMode);

  root.setAttribute("data-skin", settings.skin);
  root.setAttribute("data-content-width", settings.contentWidth);
  root.setAttribute("dir", settings.direction);
  root.classList.toggle("layout-menu-collapsed", settings.layout === "collapsed");
  root.classList.toggle("ind-layout-horizontal", settings.layout === "horizontal");
  if (settings.layout !== "collapsed") {
    root.classList.remove("layout-menu-hover");
  }
  root.setAttribute(
    "data-template",
    settings.layout === "horizontal"
      ? "horizontal-menu-template"
      : "vertical-menu-template",
  );

  const effectivePrimary = settings.primaryColor;
  if (effectivePrimary && isHexColor(effectivePrimary)) {
    const hex = expandHex(effectivePrimary);
    root.style.setProperty("--bs-primary", hex);
    const rgb = hexToRgbCsv(hex);
    if (rgb) root.style.setProperty("--bs-primary-rgb", rgb);
    root.style.setProperty("--ind-primary", hex);
  } else {
    root.style.removeProperty("--bs-primary");
    root.style.removeProperty("--bs-primary-rgb");
    root.style.removeProperty("--ind-primary");
  }

  window.dispatchEvent(
    new CustomEvent(TEMPLATE_SETTINGS_EVENT, {
      detail: { settings, resolvedMode },
    }),
  );
}

export function settingsAreDefault(settings: IndustrialTemplateSettings): boolean {
  return (
    settings.mode === DEFAULT_TEMPLATE_SETTINGS.mode &&
    settings.primaryColor.toUpperCase() === DEFAULT_TEMPLATE_SETTINGS.primaryColor.toUpperCase() &&
    settings.skin === DEFAULT_TEMPLATE_SETTINGS.skin &&
    settings.layout === DEFAULT_TEMPLATE_SETTINGS.layout &&
    settings.contentWidth === DEFAULT_TEMPLATE_SETTINGS.contentWidth &&
    settings.direction === DEFAULT_TEMPLATE_SETTINGS.direction
  );
}
