/**
 * Forge design-system tokens sourced from Sneat Free Bootstrap 5 Admin Template
 * (ThemeSelection, MIT) — v1.0.0.
 *
 * We adopt Sneat as the visual language (colors, type, radius, elevation)
 * without importing Bootstrap/jQuery. React apps consume CSS variables and
 * `.forge-*` primitives only.
 */
export const themeSource = {
  name: "Sneat",
  version: "1.0.0",
  vendor: "ThemeSelection",
  license: "MIT",
  path: "vendor/sneat-1.0.0 (reference download)",
} as const;

/** Breakpoints aligned to Bootstrap / Sneat containers. */
export const breakpoints = {
  sm: 576,
  md: 768,
  lg: 992,
  xl: 1200,
  xxl: 1440,
} as const;

export const spacingScale = [1, 2, 3, 4, 6, 8] as const;

export const sneatColors = {
  primary: "#696cff",
  secondary: "#8592a3",
  success: "#71dd37",
  info: "#03c3ec",
  warning: "#ffab00",
  danger: "#ff3e1d",
  dark: "#233446",
  black: "#435971",
  bodyBg: "#f5f5f9",
  light: "#fcfdfd",
} as const;

export const layout = {
  menuWidth: "16.25rem",
  menuCollapsedWidth: "5.25rem",
  navbarHeight: "3.875rem",
} as const;

export {
  filterNavigationGroups,
  filterNavigationItems,
  forgeStatusColors,
  type ForgeNavigationContext,
  type ForgeNavigationGroup,
  type ForgeNavigationItem,
  type ForgeProductConfig,
} from "./navigation.js";
