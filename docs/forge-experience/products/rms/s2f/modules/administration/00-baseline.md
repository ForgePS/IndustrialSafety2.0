# S2F-7 Administration & Utilities — Baseline

**Module:** Administration & Utilities  
**Date:** 2026-07-31  
**Source:** Verified `apps/rms-web` (not planning docs alone)

## Verified routes migrated

| Route             | Classification | Flag                                   | Presentation                  |
| ----------------- | -------------- | -------------------------------------- | ----------------------------- |
| `/select-tenant/` | Administration | `fx.rms.module.administration.enabled` | Tenant list + Select action   |
| `/health/`        | Utilities      | `fx.rms.module.utilities.enabled`      | Platform health probe display |

## `/select-tenant/` verified behavior

| Concern         | Live behavior                                                |
| --------------- | ------------------------------------------------------------ |
| Auth source     | `useAuth()` → `me.tenants`, `chooseTenant(tenantId)`         |
| Columns         | Display name, Slug, Status (`tenantStatus`), Current, Action |
| Select          | `chooseTenant` then `router.push("/")`                       |
| Disabled        | `!tenant.selectable` or busy selecting                       |
| Unauthenticated | Link to `/login/`                                            |
| Feature gate    | None (session utility)                                       |

## `/health/` verified behavior

| Concern      | Live behavior                                              |
| ------------ | ---------------------------------------------------------- |
| Fetch        | `apiFetchRaw("/health")`                                   |
| Fields       | `status`, `service`, `environment`, `version`, `timestamp` |
| Loading      | `"Checking API health…"`                                   |
| Feature gate | None (ops probe)                                           |

## Explicitly NOT migrated (auth / out of scope)

| Route             | Disposition                                                                    |
| ----------------- | ------------------------------------------------------------------------------ |
| `/login/`         | **Deferred** — authentication presentation; auth explicitly out of S2F-7 scope |
| `/auth/callback/` | **N/A** — OAuth callback; not an admin UI surface                              |

## Explicitly NOT present in live RMS (N/A)

| Capability                           | Status                          |
| ------------------------------------ | ------------------------------- |
| User / role / RBAC administration UI | Absent in rms-web               |
| Organization settings admin          | Absent                          |
| Feature entitlement management UI    | Absent                          |
| Integrations admin                   | Absent                          |
| Import / export tools                | Absent                          |
| Audit viewer                         | Absent                          |
| Maintenance / scheduled jobs UI      | Absent                          |
| Creator Console / Tenant Admin       | Not absorbed into RMS (charter) |

## Related but not S2F-7

| Route             | Why deferred                               |
| ----------------- | ------------------------------------------ |
| `/cad/unmapped/`  | CAD operational queue; not Admin/Utilities |
| `/cad/mappings/`  | CAD operational queue; not Admin/Utilities |
| `/configuration/` | S2F-6 NERIS Configuration                  |
