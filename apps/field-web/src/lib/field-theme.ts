/** Field appearance preference (light / dark / follow system). */

export type FieldThemePreference = "light" | "dark" | "system";
export type FieldResolvedTheme = "light" | "dark";

export const FIELD_THEME_STORAGE_KEY = "forge.field.theme-mode";
export const FIELD_THEME_EVENT = "forge.field.theme-mode";

const PRIMARY = "#696cff";
const PRIMARY_RGB = "105, 108, 255";
const THEME_COLOR_DARK = "#232333";
const THEME_COLOR_LIGHT = "#f5f5f9";

export function readFieldThemePreference(): FieldThemePreference {
  if (typeof window === "undefined") return "system";
  const stored = window.localStorage.getItem(FIELD_THEME_STORAGE_KEY);
  if (stored === "light" || stored === "dark" || stored === "system") return stored;
  return "system";
}

export function resolveFieldTheme(
  preference: FieldThemePreference = readFieldThemePreference(),
): FieldResolvedTheme {
  if (preference === "light" || preference === "dark") return preference;
  if (typeof window === "undefined") return "dark";
  return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "dark" : "light";
}

export function applyFieldTheme(resolved: FieldResolvedTheme): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.setAttribute("data-bs-theme", resolved);
  root.setAttribute("data-theme", "theme-default");
  root.classList.toggle("dark-style", resolved === "dark");
  root.classList.toggle("light-style", resolved === "light");
  root.style.colorScheme = resolved;
  root.style.setProperty("--bs-primary", PRIMARY);
  root.style.setProperty("--bs-primary-rgb", PRIMARY_RGB);

  const themeColor = resolved === "dark" ? THEME_COLOR_DARK : THEME_COLOR_LIGHT;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", themeColor);
}

export function writeFieldThemePreference(preference: FieldThemePreference): FieldResolvedTheme {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(FIELD_THEME_STORAGE_KEY, preference);
  }
  const resolved = resolveFieldTheme(preference);
  applyFieldTheme(resolved);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(FIELD_THEME_EVENT, { detail: { preference, resolved } }));
  }
  return resolved;
}

/**
 * FOUC boot lives in public/theme-boot.js (external for CSP script-src 'self').
 * Keep that file in sync with applyFieldTheme / FIELD_THEME_STORAGE_KEY.
 */
export const FIELD_THEME_BOOT_SCRIPT = `(function(){try{var k=${JSON.stringify(FIELD_THEME_STORAGE_KEY)};var r=document.documentElement;var pref=localStorage.getItem(k);if(pref!=="light"&&pref!=="dark"&&pref!=="system")pref="system";var resolved=pref==="light"||pref==="dark"?pref:(window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");r.setAttribute("data-bs-theme",resolved);r.setAttribute("data-theme","theme-default");r.classList.toggle("dark-style",resolved==="dark");r.classList.toggle("light-style",resolved==="light");r.style.colorScheme=resolved;r.style.setProperty("--bs-primary","${PRIMARY}");r.style.setProperty("--bs-primary-rgb","${PRIMARY_RGB}");}catch(e){}})();`;
