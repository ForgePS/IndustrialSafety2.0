# Workspace Migration Plan (FX-S2D)

**Document:** `09-workspace-migration.md`  
**Gate:** FX-S2D  
**Status:** IMPLEMENTED (default-off)

## First reference workspace

**Incident workspace** — the only high-risk record workspace present in `rms-web`.

| Decision                       | Outcome                                    |
| ------------------------------ | ------------------------------------------ |
| Incident as first FX workspace | **Selected** — Personnel UI does not exist |

## Implementation

| Item       | Value                                                                              |
| ---------- | ---------------------------------------------------------------------------------- |
| Flag       | `fx.rms.workspace.enabled` (default **false**, independent of shell/nav/dashboard) |
| Framework  | `apps/rms-web/src/fx/workspace/`                                                   |
| Chrome     | `FxWorkspaceLayout` + section panels with error isolation                          |
| Registry   | `FxWorkspaceRegistry` — Incident registered as `rms-incident`                      |
| Deep links | Unchanged: `/incidents/{id}/?section=`                                             |
| Rollback   | Flag off → legacy `IncidentWorkspaceLayout`                                        |

## Preserve

Record IDs, permissions, audit, attachments, deep links (`?section=`), edit/read-only states, NERIS validation, CAD panel data, autosave, review workflows.

## Out of scope

Forms redesign, tables redesign, new APIs, fabricated related records, Personnel/Prevention workspaces.
