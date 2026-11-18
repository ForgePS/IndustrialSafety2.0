# Configuration Platform Complete

**Date:** 2026-07-28  
**Environment:** development (`511343547817` / `us-east-1`)  
**Master Directive name:** Phase 4 Configuration Platform  
**Canonical roadmap map:** Phase 8 Configuration Studio (product engines)  
**Verdict:** COMPLETE for Configuration Studio product foundation  
**Acceptance:** `CONFIGURATION_PLATFORM_ACCEPTANCE.md` → **ACCEPTED_WITH_LIMITATIONS** (2026-07-28)  
**Baseline:** `CONFIGURATION_PLATFORM_BASELINE_v1.md` → **v1.0 feature-frozen** (2026-07-28)  
**Next recommendation:** Import Platform (roadmap Phase 12 Import Engine) — **do not auto-start** until explicit product-owner authorization

## Architecture

Shared **Config Object Kernel** backs every Configuration Studio module:

| Layer             | Location                                                                                                             |
| ----------------- | -------------------------------------------------------------------------------------------------------------------- |
| Domain package    | `@forge/configuration` — namespaces, Zod payloads, lifecycle transitions, hash, compare, resolve-effective, defaults |
| Schema            | `config_objects`, `config_versions` — migration `0021_configuration_platform.sql`                                    |
| RLS               | FORCE tenant isolation on both tables                                                                                |
| API               | `apps/platform-api/src/modules/configuration` — legacy key/value + studio lifecycle routes                           |
| Creator UI        | `/studio` + 27 module pages                                                                                          |
| Tenant Admin      | `apps/tenant-admin` delegated subset (13 modules)                                                                    |
| Runtime consumers | RMS `useTenantConfigStudio` for terminology / dropdowns / navigation payloads                                        |

### Lifecycle

`DRAFT` → `SCHEDULED` | `PUBLISHED` → `SUPERSEDED` | `ARCHIVED`  
Rollback clones a prior version into a new draft and publishes (published rows are immutable).

### Permissions

| Permission                       | Role                          |
| -------------------------------- | ----------------------------- |
| `platform.configuration.update`  | Creator / Tenant Admin (seed) |
| `platform.configuration.publish` | Creator / Tenant Admin (seed) |
| `tenant.configuration.update`    | Tenant Admin (delegated)      |
| `tenant.configuration.publish`   | Tenant Admin (delegated)      |

Tenant Admin cannot manage Creator-only namespaces (modules, features, security, reporting engines, etc.).

## Completed modules

All 27 Configuration Studio namespaces are live with CRUD drafts, publish/schedule/archive/rollback, compare, import/export, and audit:

1. Tenant Profile
2. Organization Profile
3. Branding
4. Navigation Editor
5. Terminology Manager
6. Module Manager
7. Feature Manager
8. Dropdown Manager
9. Custom Field Builder
10. Form Builder
11. Workflow Builder
12. Role Builder
13. Permission Manager
14. Notification Templates
15. Email Templates
16. Document Templates
17. Certificate Templates
18. Dashboard Builder
19. Reporting Configuration
20. Import Configuration
21. Export Configuration
22. Security Configuration
23. Retention Policies
24. Business Hours
25. Holiday Calendar
26. Facilities
27. Locations

Studio home also supports full-tenant JSON **export** / **import** (`forge.config.bundle.v1`).

## Remaining hard-coded items

| Item                                                  | Status                                                                                                            |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Creator Console static shell nav                      | Still ships a static studio nav list; runtime can be driven by published `navigation` payload in follow-up wiring |
| RMS incident section map                              | Defaults remain in code; labels override via published `terminology` when present                                 |
| Personnel roles                                       | Defaults in code; overridden by published `dropdowns.personnel_roles`                                             |
| NERIS official schema / value sets                    | Platform registry (not tenant-editable official keys) — overlays remain separate                                  |
| Document/Notification/Reporting **engines**           | Configuration definitions only — execution engines are Phases 9–11                                                |
| Legacy `/configuration` and `/branding` Creator pages | Kept as legacy key/value / branding; Studio is primary                                                            |

## Migration impact

| Migration                         | Additive                              |
| --------------------------------- | ------------------------------------- |
| `0021_configuration_platform.sql` | Yes — CREATE TABLE + RLS ENABLE/FORCE |

No destructive DDL. Existing `tenant_settings` / `tenant_branding` remain for compatibility; studio payloads are the versioned source of truth going forward.

**Deploy steps (development):**

1. Apply migration `0021` (ECS migrate with admin secret).
2. Redeploy `platform-api` image including `@forge/configuration`.
3. `pnpm deploy:console` (studio routes).
4. Build/host Tenant Admin when frontend stack enables it (app is ready; hosting may need CDK export if not already).
5. Re-seed permissions so `platform.configuration.publish` / `tenant.configuration.*` exist on roles.

## Tests

| Suite                                                | Result                             |
| ---------------------------------------------------- | ---------------------------------- |
| `@forge/configuration` unit                          | PASS (5)                           |
| `platform-api` `configuration-platform.unit.test.ts` | catalog coverage for 27 namespaces |
| `@forge/platform-api` typecheck                      | PASS                               |
| `@forge/creator-console` typecheck                   | PASS                               |
| `@forge/tenant-admin` typecheck                      | PASS                               |
| `@forge/rms-web` typecheck                           | PASS                               |

Live Aurora migrate + Playwright studio flows should be run as part of environment closeout (not blocking package completeness).

## Security review

- Tenant RLS forced on `config_objects` / `config_versions`.
- Namespace allowlist enforced server-side for Tenant Admin.
- Publish/schedule/archive/rollback require publish permission.
- Audit events written for draft create/patch, publish, schedule, archive, rollback.
- Domain events: `platform.configuration.version.published|scheduled|archived|rolled_back.v1`.
- Import validates namespace allowlist + Zod payloads before draft creation.
- No secrets stored in config payloads by design (security module holds policy flags only).

## Deployment notes

- Worker service unchanged.
- Application database secret unchanged (no rotation).
- AI Narrative expansion remains paused; AI flags remain default off for Phase 4 CAD tenant.
- NERIS Phase 4 CAD track is separate from this Configuration Platform phase name.

## Known limitations

1. Scheduled promotion is applied on effective-read (and can be hardened with a worker later).
2. Role/Permission studio payloads are configuration documents; live authz still uses `roles` / `role_permissions` tables — publish can be bridged in a follow-up sync job.
3. Feature/Module studio payloads wrap intent; commercial entitlements remain on entitlement APIs (ADR-017).
4. Tenant Admin static hosting may require frontend stack wiring if not yet exported.
5. Full Playwright matrix for every studio module not yet executed against Aurora in this closeout.

## Recommendation for beginning Import Platform

**Recommend next:** Master Directive **Import Platform** / roadmap **Phase 12 — Import Engine**.

Rationale: Configuration Studio now stores Import/Export **profiles**; the engine that executes uploads, mapping, preview, reconciliation, and auditable import history is the natural consumer of those profiles and unblocks customer data onboarding without hard-coded ETL.

**STOP** — do not automatically begin Import Platform, Document Engine, or resume AI Narrative commercial enablement without explicit authorization.
