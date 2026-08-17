/**
 * Generate apps/creator-console/src/app/sneat-compat.css from design-system
 * component rules (from .forge-page onward) plus Sneat-aligned tokens.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "packages", "design-system", "src", "styles.css");
const out = path.join(root, "apps", "creator-console", "src", "app", "sneat-compat.css");

const header = `/*
 * Creator Console Sneat compatibility layer.
 * Keeps .forge-* contracts used by @forge/ui and page modules while the shell
 * is native Sneat v3. Tokens alias to Bootstrap/Sneat CSS variables.
 */
@import url("https://fonts.googleapis.com/css2?family=Public+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&display=swap");

:root {
  --forge-font-sans: "Public Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --forge-font-mono: "SFMono-Regular", Menlo, Monaco, Consolas, monospace;
  --forge-space-1: 0.25rem;
  --forge-space-2: 0.5rem;
  --forge-space-3: 0.75rem;
  --forge-space-4: 1rem;
  --forge-space-5: 1.25rem;
  --forge-space-6: 1.5rem;
  --forge-space-8: 2rem;
  --forge-radius-xs: 0.125rem;
  --forge-radius-sm: 0.25rem;
  --forge-radius-md: 0.375rem;
  --forge-radius-lg: 0.5rem;
  --forge-radius-xl: 0.625rem;
  --forge-text-xs: 0.75rem;
  --forge-text-sm: 0.875rem;
  --forge-text-md: 0.9375rem;
  --forge-text-lg: 1.125rem;
  --forge-text-xl: 1.375rem;
  --forge-line-height: 1.5;
  --forge-color-primary: var(--bs-primary, #696cff);
  --forge-color-primary-hover: #5f61e6;
  --forge-color-primary-soft: rgba(105, 108, 255, 0.16);
  --forge-color-secondary: var(--bs-secondary, #8592a3);
  --forge-color-success: var(--bs-success, #71dd37);
  --forge-color-info: var(--bs-info, #03c3ec);
  --forge-color-warning: var(--bs-warning, #ffab00);
  --forge-color-danger: var(--bs-danger, #ff3e1d);
  --forge-color-dark: #233446;
  --forge-color-bg: var(--bs-body-bg, #f5f5f9);
  --forge-color-surface: var(--bs-paper-bg, #ffffff);
  --forge-color-surface-2: #f8f8fb;
  --forge-color-text: var(--bs-body-color, #566a7f);
  --forge-color-heading: #384551;
  --forge-color-muted: #a1acb8;
  --forge-color-border: var(--bs-border-color, #d9dee3);
  --forge-color-border-light: #ebeef0;
  --forge-shadow-sm: 0 0.125rem 0.25rem rgba(161, 172, 184, 0.4);
  --forge-shadow-md: 0 0.25rem 1rem rgba(161, 172, 184, 0.45);
  --forge-shadow-lg: 0 0.625rem 1.25rem rgba(161, 172, 184, 0.5);
  --forge-focus-ring: 0 0 0 0.15rem rgba(105, 108, 255, 0.35);
  --forge-menu-width: 16.25rem;
  --forge-menu-collapsed-width: 5.25rem;
  --forge-navbar-height: 3.875rem;
  --forge-touch-min: 44px;
}

.forge-visually-hidden {
  position: absolute !important;
  width: 1px !important;
  height: 1px !important;
  padding: 0 !important;
  margin: -1px !important;
  overflow: hidden !important;
  clip: rect(0, 0, 0, 0) !important;
  white-space: nowrap !important;
  border: 0 !important;
}

.forge-shell-state {
  display: grid;
  gap: 0.35rem;
  font-size: var(--forge-text-sm);
}

.min-w-0 {
  min-width: 0;
}

`;

const css = fs.readFileSync(src, "utf8");
const marker = ".forge-page {";
const idx = css.indexOf(marker);
if (idx < 0) {
  console.error("Could not find .forge-page marker in design-system styles");
  process.exit(1);
}
let body = css.slice(idx);
// Drop leftover shell-layout media queries that reference .forge-shell / .forge-sidebar
body = body.replace(
  /@media \(max-width: 991\.98px\) \{\s*\.forge-shell[\s\S]*?\.forge-sidebar\.is-open[\s\S]*?\}\s*\}/,
  "",
);

fs.writeFileSync(out, header + body, "utf8");
console.log(`Wrote ${out} (${fs.statSync(out).size} bytes)`);
