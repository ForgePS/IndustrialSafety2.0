# Configuration Platform v1.0 Baseline

**Baseline name:** Configuration Platform v1.0  
**Baseline date:** 2026-07-28  
**Environment recorded:** development (`511343547817` / `us-east-1`)  
**Acceptance status:** **ACCEPTED_WITH_LIMITATIONS**  
**Feature freeze:** **ACTIVE**

This document freezes Configuration Platform feature development. The surface below is the supported v1.0 contract. Future product changes require an approved enhancement request, architecture review, and a version increment (for example v1.1 or v2.0).

Canonical references:

- Acceptance: `docs/releases/CONFIGURATION_PLATFORM_ACCEPTANCE.md`
- Completeness: `docs/releases/CONFIGURATION_PLATFORM_COMPLETE.md`
- Authorization: `docs/security/configuration-platform-authorization-report.md`
- Access matrix: `docs/security/access-control-matrix.md`
- Monitoring: `docs/operations/configuration-platform-monitoring.md`

---

## Feature freeze policy

### Allowed without version increment

- Bug fixes
- Production defects
- Security patches
- Regression fixes
- Documentation updates

### Not allowed without approved enhancement + architecture review + version increment

- Rich visual builders
- Studio redesign
- Navigation redesign
- Terminology redesign
- Workflow redesign
- Dashboard builder enhancements
- New configuration namespaces beyond the v1.0 catalog
- Expansion into Universal Import Platform execution (separate product track)

### Import Platform

**NOT STARTED.** Do not begin Universal Import Platform without explicit product-owner authorization.

---

## Architecture summary

Shared **Config Object Kernel** backs every Configuration Studio module.

| Layer             | Location / contract                                                                                                             |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Domain package    | `@forge/configuration` — 27 namespaces, Zod payloads, lifecycle transitions, content hash, compare, resolve-effective, defaults |
| Persistence       | `config_objects`, `config_versions`                                                                                             |
| Migration         | `0021_configuration_platform.sql` (APPLIED)                                                                                     |
| Isolation         | PostgreSQL FORCE RLS on both tables; API tenant guards                                                                          |
| API module        | `apps/platform-api/src/modules/configuration`                                                                                   |
| Bundle format     | `forge.config.bundle.v1` (export / import / dry-run)                                                                            |
| Creator UI        | `/studio` — 27 module pages as **OPERATIONAL_GENERIC_EDITOR** (JSON lifecycle editors)                                          |
| Tenant Admin UI   | `apps/tenant-admin` — 13 delegated namespaces                                                                                   |
| Runtime consumers | RMS hooks for terminology / dropdowns / navigation payloads (with hard-coded fallbacks)                                         |
| Observability     | EMF namespace `Forge/Configuration`; dashboard `forge-development-configuration-platform`                                       |

### Lifecycle (v1.0)

```
DRAFT → SCHEDULED | PUBLISHED → SUPERSEDED | ARCHIVED
```

- Published rows are immutable.
- Rollback clones a prior version into a new draft and publishes.
- Scheduled promotion may occur on effective-read when due.

### Permissions (v1.0)

| Permission                       | Purpose                                                   |
| -------------------------------- | --------------------------------------------------------- |
| `platform.configuration.update`  | Creator / platform draft mutate                           |
| `platform.configuration.publish` | Creator / platform publish, schedule, archive, rollback   |
| `tenant.configuration.update`    | Tenant-delegated draft mutate (allowlist namespaces)      |
| `tenant.configuration.publish`   | Tenant-delegated publish lifecycle (allowlist namespaces) |
| `platform.audit.read`            | Read-only catalog / version visibility for auditors       |

Update and publish are independent. Tenant principals with only `tenant.configuration.*` cannot manage Creator-only namespaces (including `security`).

---

## Deployment versions (baseline snapshot)

| Component              | Value                                                                            |
| ---------------------- | -------------------------------------------------------------------------------- |
| API task definition    | `forge-development-ecs-platform-api:28`                                          |
| API image tag          | `config-accept-20260728092807`                                                   |
| API image digest       | `sha256:60572176a163fd7d2cab70e81aa6a9d28fbba76c5c1c72f337fa9eed86802bff`        |
| ECR repository         | `511343547817.dkr.ecr.us-east-1.amazonaws.com/forge-development-ecr-platformapi` |
| Worker task definition | `forge-development-ecs-platform-worker:19` (unchanged by config work)            |
| Worker image tag       | `closeout-20260727125918`                                                        |
| Creator Console        | `https://ddztl9s33wu40.cloudfront.net` (distribution `EUY00O1FSF7BG`)            |
| Tenant Admin           | `https://d1uxdl4szvsixc.cloudfront.net` (distribution `E3O4NP8GCEEK23`)          |
| Tenant Admin bucket    | `forge-development-tenantadmin-511343547817-us-east-1`                           |
| API edge               | `https://d108fstxdv69bo.cloudfront.net`                                          |
| App DB secret          | `forge-development-secrets-database-app` (no rotation as part of baseline)       |

---

## Migration versions

| Migration                                 | Status            | Notes                                                    |
| ----------------------------------------- | ----------------- | -------------------------------------------------------- |
| `0021_configuration_platform.sql`         | **APPLIED**       | Creates `config_objects` / `config_versions` + FORCE RLS |
| Prior platform migrations (`0001`–`0020`) | Required baseline | Not modified by Configuration Platform freeze            |

No further Configuration Platform schema expansions are in scope under v1.0 freeze without a versioned enhancement.

---

## API versions

| Surface                                 | Contract                                                                      |
| --------------------------------------- | ----------------------------------------------------------------------------- |
| API major path                          | `/api/v1/...`                                                                 |
| Catalog                                 | `GET /api/v1/config/catalog`                                                  |
| Studio list / draft                     | `GET                                                                          | POST /api/v1/tenants/:tenantId/config/:namespace`             |
| Versions                                | `GET                                                                          | PATCH .../config/:namespace/:objectKey/versions[/:versionId]` |
| Publish / schedule / archive / rollback | `POST .../versions/:versionId/{publish\|schedule\|archive\|rollback}`         |
| Compare / effective                     | `GET .../compare`, `GET .../effective`                                        |
| Export                                  | `GET /api/v1/tenants/:tenantId/config-export`                                 |
| Import                                  | `POST /api/v1/tenants/:tenantId/config-import` (`dryRun` query or body)       |
| Legacy key/value                        | `.../configuration/...` (retained for compatibility)                          |
| Bundle schema                           | `forge.config.bundle.v1`                                                      |
| Domain package                          | `@forge/configuration` (workspace package; treat payload schemas as v1.0 API) |

Breaking changes to routes, permission semantics, bundle format, or namespace Zod schemas require a Configuration Platform version increment.

---

## Image digests

| Image             | Digest                                                                                                                 |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Baseline (retain) | `sha256:60572176a163fd7d2cab70e81aa6a9d28fbba76c5c1c72f337fa9eed86802bff` (`config-accept-20260728092807`)             |
| Immediate prior   | `sha256:f0f139ec3930f98ca621e9b9f7032c7e395cde3915b5cd990f42a58b64806d00` (`config-accept-20260728054933`, task `:27`) |

---

## Acceptance status

| Item                                          | Value                            |
| --------------------------------------------- | -------------------------------- |
| Verdict                                       | **ACCEPTED_WITH_LIMITATIONS**    |
| Authz matrix                                  | 22 passed / 0 failed / 0 skipped |
| Config e2e (Playwright + axe)                 | 5 passed / 0 failed / 0 skipped  |
| Studio modules live lifecycle                 | 27 passed / 0 failed             |
| Dry-run import                                | PASS                             |
| Tenant isolation API / RLS                    | PASS                             |
| Full monorepo / Phase 2–4 / AI regression bar | NOT MET (limitation)             |

---

## Known limitations

1. Full Phase 2 / Phase 3 / NERIS Phase 4 / AI Foundation Playwright and full integration suites were not re-executed for this baseline closeout.
2. Monorepo lint/typecheck failures on unrelated RMS packages remain outside this freeze but block a clean full-repo green bar.
3. Manual WCAG 2.2 AA matrix is incomplete (automated critical axe findings: 0).
4. All 27 Studio modules ship as **OPERATIONAL_GENERIC_EDITOR** (JSON lifecycle editors), not rich visual builders.
5. Platform Support time-limited session workflow is not operationalized (permissions exist; TTL/session machinery incomplete).
6. Role / permission Studio payloads are configuration documents only; live authz still uses `roles` / `role_permissions` tables (no publish→authz bridge).
7. Feature / module Studio payloads express intent; commercial entitlements remain on entitlement APIs.
8. Scheduled promotion relies on effective-read promotion path (worker hardener deferred).
9. Hard-coded RMS / Creator fallbacks remain where published config is absent (see hard-coded registers).
10. Acceptance remains **ACCEPTED_WITH_LIMITATIONS**, not full **ACCEPTED**.

---

## Rollback references

| Component                 | Rollback target                                                                                                                    |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| API (from baseline `:28`) | Task `:27` / tag `config-accept-20260728054933` / digest `sha256:f0f139ec3930f98ca621e9b9f7032c7e395cde3915b5cd990f42a58b64806d00` |
| API (earlier)             | Task `:26` / tag `ai-ops-20260728052254`                                                                                           |
| Worker                    | Leave at `:19` / `closeout-20260727125918` unless a separate defect requires change                                                |
| Tenant Admin static       | S3 versioning on tenant-admin bucket + CloudFront invalidation `E3O4NP8GCEEK23`                                                    |
| Database                  | Do not drop `0021` tables in place; restore via approved backup/restore procedure only                                             |
| Secrets                   | Do **not** rotate `forge-development-secrets-database-app` as part of config rollback                                              |

---

## Supported features (v1.0)

### Catalog (27 namespaces)

1. Tenant Profile
2. Organization Profile
3. Branding
4. Navigation
5. Terminology
6. Modules
7. Features
8. Dropdowns
9. Custom Fields
10. Forms
11. Workflows
12. Roles
13. Permissions
14. Notification Templates
15. Email Templates
16. Document Templates
17. Certificate Templates
18. Dashboards
19. Reporting
20. Import Configuration
21. Export Configuration
22. Security
23. Retention
24. Business Hours
25. Holiday Calendar
26. Facilities
27. Locations

### Capabilities

- Draft create / patch
- Publish, schedule, archive, rollback
- Version history and compare
- Effective config resolution (including due schedule promotion on read)
- Ensure defaults
- Tenant export (`forge.config.bundle.v1`)
- Tenant import with optional **dry-run** (validation, conflict report, summary; no persistence when dry-run)
- Audit events for lifecycle mutations
- Domain events for published / scheduled / archived / rolled back
- Creator Studio (27) and Tenant Admin Studio (13 allowlisted)
- Authorization personas and permission independence as verified in the authz report
- EMF metrics and CloudWatch alarms for config denial / failure classes

### Explicitly out of v1.0 supported product scope

- Universal Import Platform / import execution engine
- Document / notification / reporting **engines** (definitions only in config)
- Rich visual builders for any module
- AI configuration expansion beyond existing platform foundations

---

## Deferred enhancements

| Enhancement                                                      | Status                                              |
| ---------------------------------------------------------------- | --------------------------------------------------- |
| Rich visual builders (forms, workflows, dashboards, etc.)        | Deferred — requires version increment               |
| Studio / navigation / terminology / workflow redesign            | Deferred                                            |
| Dashboard builder enhancements                                   | Deferred                                            |
| Publish bridge from roles/permissions Studio → live authz tables | Deferred                                            |
| Worker-based scheduled publish hardener                          | Deferred                                            |
| Platform Support time-limited sessions                           | Deferred                                            |
| Full manual WCAG 2.2 AA closeout                                 | Deferred (docs/regression only until authorized)    |
| Promotion from ACCEPTED_WITH_LIMITATIONS → ACCEPTED              | Deferred (regression/a11y gates)                    |
| Universal Import Platform                                        | Deferred — **product-owner authorization required** |

---

## Compatibility guarantees

Under Configuration Platform v1.0 freeze, the platform guarantees:

1. **Namespace catalog stability** — the 27 namespaces remain available; removals or renames require a version increment.
2. **Bundle compatibility** — `forge.config.bundle.v1` remains importable; a new bundle major (`v2`) requires a version increment.
3. **Lifecycle semantics** — DRAFT / SCHEDULED / PUBLISHED / SUPERSEDED / ARCHIVED transitions remain as documented; published immutability remains.
4. **Permission key stability** — `platform.configuration.update|publish` and `tenant.configuration.update|publish` retain their v1.0 meanings; update ≠ publish.
5. **Tenant Admin allowlist** — Creator-only namespaces stay denied for tenant-only principals.
6. **RLS** — `config_objects` / `config_versions` remain FORCE RLS tenant-isolated.
7. **API path compatibility** — existing `/api/v1/.../config...` routes remain; breaking path or response contract changes require a version increment.
8. **Dry-run safety** — dry-run import must not persist drafts or versions.
9. **Additive-only schema default** — further Configuration Platform DDL under freeze is limited to approved defect/security fixes; additive product schema needs a versioned enhancement.
10. **Secret safety** — application database secret rotation is not part of routine Configuration Platform change.

Bug fixes and security patches may adjust implementation detail without a product version bump only when they preserve these guarantees.

---

## Change control

| Change type                                            | Requirement                                                                |
| ------------------------------------------------------ | -------------------------------------------------------------------------- |
| Bug / defect / security / regression / docs            | Allowed under freeze                                                       |
| Product enhancement (including redesigns and builders) | Approved enhancement request + architecture review + **version increment** |
| Universal Import Platform                              | Explicit product-owner authorization (separate track)                      |

**Configuration Platform is feature-frozen at v1.0.**

---

## STOP

Wait for explicit product-owner authorization before beginning the Universal Import Platform.
