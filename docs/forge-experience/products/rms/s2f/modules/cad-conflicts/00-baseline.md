# S2F-5 CAD Conflicts — Baseline

**Module:** CAD Conflicts  
**Date:** 2026-07-31  
**Source:** Verified `apps/rms-web` (not planning docs alone)

## Live route migrated

| Route             | Entry                        | Gate         | APIs                                     |
| ----------------- | ---------------------------- | ------------ | ---------------------------------------- |
| `/cad/conflicts/` | `app/cad/conflicts/page.tsx` | `cadEnabled` | `listCadConflicts`, `resolveCadConflict` |

## Verified list behavior

| Concern       | Live behavior                                                                 |
| ------------- | ----------------------------------------------------------------------------- |
| Query         | Hard-coded `{ status: "OPEN" }` — no filter UI                                |
| Columns       | Type (`conflictType`), Severity, Field (`fieldIdentifier`), Incident, Actions |
| Incident link | `/incidents/{incidentId}/` with truncated id label when present               |
| Empty copy    | `"No open conflicts."`                                                        |

## Verified resolution actions

| Button     | `resolutionAction` | Reason template                                |
| ---------- | ------------------ | ---------------------------------------------- |
| Keep Forge | `KEEP_FORGE`       | `Resolved from CAD conflicts UI as KEEP_FORGE` |
| Use CAD    | `USE_CAD`          | `Resolved from CAD conflicts UI as USE_CAD`    |
| Escalate   | `ESCALATE`         | `Resolved from CAD conflicts UI as ESCALATE`   |

Payload also sends `recordVersion` from the row. After resolve, list reloads.

## Explicitly NOT present in live UI

| Capability                             | Status                                             |
| -------------------------------------- | -------------------------------------------------- |
| Conflict detail route / drawer         | Absent                                             |
| Search / filter / sort / pagination UI | Absent (OPEN-only full list)                       |
| Status column display                  | `status` on type but not shown (list is OPEN-only) |
| Closed / historical conflicts view     | Absent                                             |
| Auto-resolution controls               | Absent                                             |
| Create incident from conflict          | Absent                                             |

## Related but out of S2F-5 scope

| Route                                  | Why deferred                |
| -------------------------------------- | --------------------------- |
| `/cad/operations/`                     | Separate operations summary |
| `/cad/messages/`                       | S2F-3                       |
| `/cad/connections/`                    | S2F-4                       |
| `/cad/unmapped/`, `/cad/mappings/`     | Not this module             |
| Conflict detection / matching backends | Explicitly not authorized   |
