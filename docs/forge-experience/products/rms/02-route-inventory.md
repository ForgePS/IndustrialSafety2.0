# Route Inventory — Forge RMS

**Document:** `02-route-inventory.md`  
**Source:** `apps/rms-web/src/app/**/page.tsx`  
**Verified:** 2026-07-30  
**Trailing slashes:** required (`trailingSlash: true`)

## App Router routes

| #   | Path                | File                           | Auth                   | Feature flag (UI)                        | Risk          | Owner domain |
| --- | ------------------- | ------------------------------ | ---------------------- | ---------------------------------------- | ------------- | ------------ |
| 1   | `/`                 | `app/page.tsx`                 | Soft                   | none                                     | Low           | Hub          |
| 2   | `/login/`           | `app/login/page.tsx`           | Public                 | none                                     | High (auth)   | Auth         |
| 3   | `/auth/callback/`   | `app/auth/callback/page.tsx`   | Public                 | none                                     | High (auth)   | Auth         |
| 4   | `/select-tenant/`   | `app/select-tenant/page.tsx`   | Soft                   | none                                     | High (tenant) | Auth         |
| 5   | `/health/`          | `app/health/page.tsx`          | Public                 | none                                     | Low           | Ops          |
| 6   | `/incidents/`       | `app/incidents/page.tsx`       | `RequireAuth` (layout) | `rms.neris.incident_shell.enabled`       | High          | NERIS        |
| 7   | `/incidents/new/`   | `app/incidents/new/page.tsx`   | RequireAuth            | `rms.neris.manual_intake.enabled`        | High          | NERIS        |
| 8   | `/incidents/[id]/`  | `app/incidents/[id]/page.tsx`  | RequireAuth            | incident shell                           | **Critical**  | NERIS        |
| 9   | `/review/`          | `app/review/page.tsx`          | Soft + FeatureGate     | `rms.neris.officer_review.enabled`       | High          | NERIS        |
| 10  | `/configuration/`   | `app/configuration/page.tsx`   | Soft + FeatureGate     | `rms.neris.tenant_configuration.enabled` | High          | NERIS        |
| 11  | `/cad/operations/`  | `app/cad/operations/page.tsx`  | Soft + FeatureGate     | `rms.cad.operations.enabled`             | High          | CAD          |
| 12  | `/cad/conflicts/`   | `app/cad/conflicts/page.tsx`   | Soft + FeatureGate     | `rms.cad.enabled`                        | High          | CAD          |
| 13  | `/cad/messages/`    | `app/cad/messages/page.tsx`    | Soft + FeatureGate     | `rms.cad.operations.enabled`             | Medium        | CAD          |
| 14  | `/cad/connections/` | `app/cad/connections/page.tsx` | Soft + FeatureGate     | `rms.cad.enabled`                        | High          | CAD          |
| 15  | `/cad/unmapped/`    | `app/cad/unmapped/page.tsx`    | Soft + FeatureGate     | `rms.cad.enabled`                        | Medium        | CAD          |
| 16  | `/cad/mappings/`    | `app/cad/mappings/page.tsx`    | Soft + FeatureGate     | `rms.cad.enabled`                        | Medium        | CAD          |

**Total routes accounted for:** 16/16 filesystem pages.

## Pseudo-routes (query sections)

Incident workspace deep links: `/incidents/[id]/?section=<KEY>`

Keys (22): `OVERVIEW`, `DISPATCH`, `LOCATION`, `UNITS_PERSONNEL`, `CLASSIFICATION`, `FIRE`, `STRUCTURE`, `WILDLAND`, `HAZMAT`, `RESCUE`, `EXPLOSION`, `EXPOSURES`, `CIVILIAN_CASUALTIES`, `FIRE_SERVICE_CASUALTIES`, `ALARM_DETECTION`, `FIRE_PROTECTION`, `EMERGING_HAZARDS`, `RISK_REDUCTION`, `INCIDENT_ANALYSIS`, `NARRATIVE`, `ATTACHMENTS`, `REVIEW`

Preserve all deep links during shell/workspace migration.

## Layouts

| Path                       | Behavior                              |
| -------------------------- | ------------------------------------- |
| `app/layout.tsx`           | `ApiBootstrap` + `AppShell` wraps all |
| `app/incidents/layout.tsx` | Redirect unauthenticated → `/login/`  |

## Middleware

None. Do not add auth middleware that changes auth behavior without separate authorization.

## Not in inventory (no page files)

Personnel, training, scheduling, daily log, fleet, prevention/*, hydrants, preplans, documents, reports, employee portal, NERIS submission status console beyond configuration/incident flow, global search route, notifications route, My Work route.

## Gaps / P0 inventory

| ID        | Severity | Finding                                                               | Disposition                                              |
| --------- | -------- | --------------------------------------------------------------------- | -------------------------------------------------------- |
| INV-R-001 | P2       | Soft-auth pages rely on FeatureGate/UX rather than layout RequireAuth | Document; do not weaken; S2B must preserve permission UX |
| INV-R-002 | Info     | Config Studio nav unused                                              | Compatibility note for S2B                               |

**Unresolved P0 inventory gaps:** none for existing routes.
