# 01 — FX-P1 Deployment Plan

**Program:** Forge Experience — Forge RMS  
**Phase:** FX-P1 Controlled Pilot  
**Date:** 2026-07-31  
**Status:** AUTHORIZED — **awaiting pilot tenant designation** before enablement

## Principles

1. Global seed defaults for all `fx.rms.*` flags remain **false**.
2. Enable only via **tenant-scoped** `feature_overrides` for the approved pilot tenant.
3. Never set platform-wide defaults to true.
4. Enable foundations first, then one module at a time.
5. CAD Connections deferred until S2F-4 validation conditions close (unless separately waived).
6. Immediate rollback = delete tenant override (target &lt; 5 minutes).
7. No new functionality in FX-P1.

## Phased enablement order

Aligned with FX-P2 wave sequencing (do not reorder without formal approval).

| Wave | Flags                                                                     | Gate                              |
| ---- | ------------------------------------------------------------------------- | --------------------------------- |
| 0    | None (legacy only)                                                        | Confirm defaults OFF globally     |
| 1    | `shell`, `navigation`, `workspace`, `forms`, `tables`, `module.incidents` | Incidents + foundations validated |
| 2    | `module.incidentReview` (+ tables/forms)                                  | Review validated                  |
| 3    | `module.cadMessages` (+ tables)                                           | CAD messages validated            |
| 4    | `module.cadConflicts` (+ tables)                                          | Conflicts validated               |
| 5    | `module.nerisConfiguration` (+ forms)                                     | Config validated                  |
| 6    | `module.administration` (+ tables)                                        | Admin validated                   |
| 7    | `module.utilities`                                                        | Utilities validated               |
| 8    | `module.cadConnections` (+ forms/tables)                                  | **Only after S2F-4 conditions**   |

Dashboard (`fx.rms.dashboard.enabled`) may be enabled independently if desired; not required for module FX.

## Enablement mechanism (tenant-only)

```http
PUT /api/v1/tenants/{pilotTenantId}/features/{featureKey}
Authorization: Bearer <platform.feature.manage>
Content-Type: application/json

{ "value": true, "reason": "FX-P1 pilot wave N" }
```

Creator Console: **Feature flags** → `/features?tenantId={pilotTenantId}` → Put tenant override.

Rollback:

```http
DELETE /api/v1/tenants/{pilotTenantId}/features/{featureKey}
```

## Pre-flight checklist

- [ ] Pilot tenant UUID designated and recorded in `02-pilot-tenant.md`
- [ ] Environment (prod / staging) confirmed
- [ ] Admin + rollback contacts recorded
- [ ] Monitoring dashboards / alerts reviewed (`05-monitoring-results.md`)
- [ ] Wave 0: confirm no global `fx.rms.*` defaults are true
- [ ] Communication to pilot users prepared

## Stop conditions

Suspend pilot and delete overrides if: P0, tenant isolation failure, auth failure, rollback failure, data corruption, or FX-attributable outage.
