# Theme Certification — FX-S1.5

**Document:** `docs/forge-experience/reference/theme-certification.md`  
**Subject:** Light / Dark / High Contrast via `data-fx-theme`  
**Date:** 2026-07-30  
**Status:** COMPLETE

## Method

- Theme switcher in reference shell exercised for all three themes
- Grep audit of `packages/fx-ui`, `packages/fx-layouts`, and reference `src` for hard-coded hex/rgb (none found in component styles; tokens only)
- Visual review of dashboard, playground, forms under each theme
- Screenshots: `evidence/screenshots/fx-s15-dashboard-{light,dark,high-contrast}.png`

## Confirmations

| Requirement                                    | Result |
| ---------------------------------------------- | ------ |
| No hard-coded colors in shared components      | Pass   |
| No inaccessible combinations (text on surface) | Pass   |
| No unreadable interactive states               | Pass   |
| Charts/maps use CSS variables                  | Pass   |
| High contrast distinguishable from dark        | Pass   |

## Component matrix (themes)

| Component                        | Light | Dark | High contrast |
| -------------------------------- | ----- | ---- | ------------- |
| Shell / nav / banner             | Pass  | Pass | Pass          |
| Buttons / badges                 | Pass  | Pass | Pass          |
| Cards / metrics / KPI trend      | Pass  | Pass | Pass          |
| Alerts / weather banner          | Pass  | Pass | Pass          |
| Forms / fields                   | Pass  | Pass | Pass          |
| Tables                           | Pass  | Pass | Pass          |
| Charts (line/bar/area/pie/donut) | Pass  | Pass | Pass          |
| Map panel / legend               | Pass  | Pass | Pass          |
| Weather cards                    | Pass  | Pass | Pass          |
| Dialog                           | Pass  | Pass | Pass          |

## Issues

| ID    | Severity | Component        | Description                                                | Recommended fix                                        | Status   |
| ----- | -------- | ---------------- | ---------------------------------------------------------- | ------------------------------------------------------ | -------- |
| T-001 | Low      | Badges / offline | Uses `color-mix()` — older Safari may need solid fallbacks | Add solid token fallbacks when targeting Safari < 16.2 | Open     |
| T-002 | Info     | Env banner       | Warning surface uses inverse text intentionally            | Keep; verify HC pairing in products                    | Accepted |

## Sign-off

Theme certification complete for Forge Experience Design System RC1.
