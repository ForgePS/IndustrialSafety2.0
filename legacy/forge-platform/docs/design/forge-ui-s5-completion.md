# FORGE-UI-S5 COMPLETION REPORT

**Status:** PASS WITH LIMITATIONS  
**Date:** 2026-08-08  
**Workstream:** FORGE-UI-SNEAT → Industrial responsive + UX hardening  
**Applications Modified:** `industrial-web`  
**Packages Modified:** none

## Scope executed

| Area                   | Change                                                                                                                     |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Shell drawer           | Escape closes menu; body scroll lock; aria-expanded / aria-controls; overlay as dismiss button; auto-collapse at ≥1200px   |
| Navbar tenant switcher | Selectable tenants via sticky `chooseTenant`; label-only when single tenant                                                |
| Navbar / footer        | Truncating tenant control; wrapping actions; shorter footer on phone                                                       |
| Content CSS            | Ops/workspace layout that components already referenced (`ind-ops-*`, filters, tables, LOTO, seasonal, personnel switcher) |
| Table overflow         | `.ind-table-wrap` / `.ind-ops-table-wrap` horizontal scroll containers                                                     |
| Dashboard              | Phone-first KPI columns; full-width launcher cards at xs; Settings shortcut                                                |
| Settings               | Phone-first card columns                                                                                                   |
| Theme assets           | Restored vendored Sneat Free under `apps/industrial-web/public/sneat` (was missing from this worktree)                     |

## Responsive matrix (layout contracts)

| Width    | Class       | Nav                           | Tables             | Forms / filters   | Dashboard             | Seasonal / LOTO                  |
| -------- | ----------- | ----------------------------- | ------------------ | ----------------- | --------------------- | -------------------------------- |
| ≤575     | Phone       | Hamburger + overlay drawer    | H-scroll           | Labels full-width | 1-col KPIs / launcher | Drawer stacks; compact padding   |
| 576–767  | Phone/large | Same                          | H-scroll           | Labels full-width | 2-col KPIs begin      | Same                             |
| 768–1199 | Tablet      | Same (Sneat xl break at 1200) | H-scroll           | Wrap              | Multi-col cards       | Sticky detail where space allows |
| ≥1200    | Desktop     | Persistent sidebar            | Native table width | Inline filters    | Full grid             | Side panels usable               |

Manual device capture screenshots are deferred (local CSS/responsive contracts verified in code; browser matrix not attached this pass).

## Surfaces covered

- Shell: `industrial-shell.tsx`
- Styles: `app/globals.css`
- Dashboard: `industrial-dashboard.tsx`
- Settings: `app/settings/page.tsx`
- Workspaces consuming ops CSS: personnel / seasonal, equipment, LOTO, compliance, high-risk, tasks, documents, QR, messaging, reporting, emergency, import

## Data source status

- Unchanged from S3/S4 — no new APIs
- Settings remains Not connected

## Migration impact

**NONE**

## Production changes

**NONE** (local UI only until Industrial redeploy)

## Known limitations

- Industrial remains on full Sneat shell (not `ForgeAppShell`) — **by design** (visual SoT = Sneat)
- Firebase green/Inter visual alignment is **REJECTED** — see `docs/design/industrial-visual-source-of-truth.md`
- Browser screenshot evidence pack not attached; phone matrix checked against CSS contracts + local layout

## Remediation notes (2026-08-11 design override)

- LG-01: Sneat demo glyph replaced with Forge Industrial mark; default short name `Forge Industrial`
- NV-01: Search/Help stubs removed; facility selector shown only when facilities API returns data
- ST-01: Settings is a hub of live links (no fake save / “Not connected” tiles)
- DK-01: Dark toggle retained (Free CSS dark incomplete — acceptable until Pro dark or removal)

## Next recommended checkpoint

- Optional: attach mobile screenshot evidence for Producers staging UAT
- Later: brand pack when Forge logos are available
- Industrial-dev redeployed with S5 + tenant switcher (see Redeployed note below)
  **Redeployed:** 2026-08-08 — `pnpm deploy:industrial-web` → bucket `forge-development-industrial-511343547817-us-east-1`, CloudFront invalidation `I8I10IDT85D1V25FAFA21YTNJA`. Live `https://industrial-dev.forgepublicsafety.com/` returns 200 with vendored `/sneat/*` assets.
