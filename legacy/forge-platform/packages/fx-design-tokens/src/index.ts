/**
 * FX design tokens — TypeScript accessors.
 * Visual values live in styles.css / theme CSS; components must use CSS variables.
 */
export type FxTheme = "light" | "dark" | "high-contrast";

export const FX_THEME_ATTR = "data-fx-theme";

export const fxSpace = {
  4: "var(--fx-space-4)",
  8: "var(--fx-space-8)",
  12: "var(--fx-space-12)",
  16: "var(--fx-space-16)",
  20: "var(--fx-space-20)",
  24: "var(--fx-space-24)",
  32: "var(--fx-space-32)",
  40: "var(--fx-space-40)",
  48: "var(--fx-space-48)",
  64: "var(--fx-space-64)",
  80: "var(--fx-space-80)",
  96: "var(--fx-space-96)",
} as const;

export const fxBreakpoints = {
  phone: 639,
  tabletPortrait: 640,
  tabletLandscape: 1024,
  desktop: 1280,
  largeDesktop: 1600,
  operationsDisplay: 1920,
} as const;

export function applyFxTheme(theme: FxTheme, el: HTMLElement = document.documentElement): void {
  el.setAttribute(FX_THEME_ATTR, theme);
}
