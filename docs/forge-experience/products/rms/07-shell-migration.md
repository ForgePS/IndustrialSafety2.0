# Shell Migration Plan (FX-S2B)

**Document:** `07-shell-migration.md`  
**Gate:** FX-S2B  
**Status:** IMPLEMENTED (default-off)

## Implementation

| Piece          | Path                                     | Retirement         |
| -------------- | ---------------------------------------- | ------------------ |
| Boundary       | `src/fx/shell/RmsShellBoundary.tsx`      | Permanent selector |
| FX shell       | `src/fx/shell/RmsFxShell.tsx`            | Evolves with FX    |
| Legacy adapter | `src/fx/shell/RmsLegacyShellAdapter.tsx` | After GA + window  |
| Flag resolver  | `src/fx/flags/rms-fx-flags.ts`           | Permanent          |

## Flags

| Shell | Nav   | Result                                    |
| ----- | ----- | ----------------------------------------- |
| false | false | Legacy                                    |
| true  | false | FX shell + registry nav via legacy bridge |
| true  | true  | FX shell + secondary nav                  |
| false | true  | Rejected → legacy                         |

Platform-admin wildcard does **not** auto-enable FX presentation. Use tenant override, `NEXT_PUBLIC_FX_RMS_*_ENABLED=true`, or `sessionStorage` for tests.

## Shell includes

Product identity, tenant identity, environment indicator, primary/secondary nav, breadcrumbs, user session actions, theme switcher, Search / My Work / Notifications / Help / Support entry points (honest capability), offline indicator, mobile drawer with focus trap.

## Legacy CSS

`app/shell.module.css` retained for legacy path only. FX path uses `rms-fx-shell.css` (tokens).
