# FX-S2A Completion Report — Forge RMS Inventory & Compatibility

**Date:** 2026-07-30  
**Product:** Forge RMS (`apps/rms-web`)  
**Standard:** Forge Experience Design System `v1.0.0-RC1`  
**Gate:** FX-S2A — Inventory and Compatibility

---

## Decision requested

```text
APPROVE FX-S2B
```

Alternate options for reviewers: `APPROVE WITH CONDITIONS` · `RETURN FOR CORRECTION`

**Recommended:** **APPROVE FX-S2B** with conditions below.

### Suggested conditions

1. Resolve or explicitly defer **DEC-S2-005** (Config Studio nav vs hardcoded) before coding nav adapter.
2. Confirm **DEC-S2-004** posture: Incident may be first FX workspace **or** Personnel waits for UI — document choice before S2D.
3. Do not seed `fx.rms.*` flags default-on.
4. No NERIS/CAD/auth behavior changes in S2B.

---

## Summary counts

| Metric                             | Value                                                                                       |
| ---------------------------------- | ------------------------------------------------------------------------------------------- |
| Routes inventoried                 | **16** (100% of `rms-web` pages)                                                            |
| Screens inventoried                | **16** top-level + **22** incident sections                                                 |
| Local components inventoried       | **14** + 2 hooks + 2 CSS modules                                                            |
| Classification totals              | Extension **12** · Temp compatibility **5** · Legacy CSS **2** · Unknown **0**              |
| Shared FX reuse candidates         | Shell, buttons/alerts, workspace, table adapter, dialogs, dashboard widgets                 |
| RMS-specific extensions            | Incident/CAD/NERIS/AI/specialty/attachments/field-renderer                                  |
| Temporary compatibility components | AppShell, FeatureGate chrome, EnvironmentBanner bridge, searchable-select, ListControlsView |
| Unknown components                 | **0**                                                                                       |
| Permission gaps                    | Prevention/catalog modules without UI; soft-auth pages need careful S2B handling            |
| Feature-flag plan                  | Designed (`18`) — existing product flags unchanged; FX flags default-off                    |
| High-risk workflows                | Incident lifecycle, NERIS config, CAD conflict apply, attachments isolation, AI narrative   |
| Regression coverage                | Existing Playwright suite mapped; FX scaffold spec added (skipped)                          |
| Open defects (migration)           | None P0; inventory notes P2/Info only                                                       |
| Risks                              | See `22-risk-register.md`                                                                   |
| Visible production changes in S2A  | **None**                                                                                    |

---

## Deliverables checklist

| Deliverable                            | Status                                             |
| -------------------------------------- | -------------------------------------------------- |
| FX-S2 documentation tree               | ✓ `docs/forge-experience/products/rms/`            |
| Component registry                     | ✓ `docs/forge-experience/44-component-registry.md` |
| Current-state baseline                 | ✓                                                  |
| Route / screen / component inventories | ✓                                                  |
| Classifications                        | ✓                                                  |
| Feature-flag design                    | ✓                                                  |
| Compatibility adapters (design)        | ✓ `evidence/plans/compatibility-adapters.md`       |
| Risk register                          | ✓                                                  |
| Regression scaffolding                 | ✓ e2e scaffold + plan                              |
| Evidence index                         | ✓                                                  |

---

## High-risk workflows identified

1. Incident create → edit → specialty → review → approve/return/finalize/void
2. NERIS tenant configuration manage
3. CAD ingest → conflicts → apply / keep Forge
4. Attachments upload/archive + cross-tenant isolation
5. AI narrative rewrite/quality under stacked flags

## Material baseline finding

`rms-web` today is **NERIS + CAD**, not the full multi-module fire RMS described in long-range adoption docs. Personnel/prevention/fleet/etc. are **catalog/legacy gaps**, not missing inventory rows inside the current app. FX-S2B should proceed against the **live** surface area without inventing routes.

---

## Open items (non-blocking for S2A)

| ID          | Item                                 | Owner         |
| ----------- | ------------------------------------ | ------------- |
| DEC-S2-004  | First FX workspace choice            | Product owner |
| DEC-S2-005  | Nav source of truth                  | Product owner |
| R-S2-007    | Mobile nav disclosure in FX shell    | FX + RMS S2B  |
| T-001 (RC1) | Safari color-mix fallbacks before GA | FX            |

---

## Recommended next step

After approval: begin **FX-S2B — Application Shell and Navigation** behind `fx.rms.shell.enabled` / `fx.rms.navigation.enabled` (default off), implementing adapters designed in S2A, with rollback tested before any tenant enablement.

**Do not begin S2B until this report is formally approved.**
