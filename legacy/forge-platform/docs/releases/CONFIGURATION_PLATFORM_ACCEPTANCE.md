# Configuration Platform — Acceptance Report (Final Acceptance Sprint)

**Date:** 2026-07-28  
**Environment:** development  
**Account:** `511343547817`  
**Region:** `us-east-1`  
**Final verdict:** **ACCEPTED_WITH_LIMITATIONS**  
**Baseline:** Configuration Platform **v1.0** — feature-frozen (`docs/releases/CONFIGURATION_PLATFORM_BASELINE_v1.md`)

Configuration Platform gates for authz (22/22), dry-run import, EMF metrics/alarms, config e2e, and RLS re-verification passed on API `:28`. Not promoted to **ACCEPTED** because the required full-regression bar (**0 failed / 0 skipped** across Phase 2/3/NERIS Phase 4/AI/monorepo lint/typecheck/integration) was **not met**, and manual WCAG remains incomplete.

## Deployment versions

| Component           | Value                                                                     |
| ------------------- | ------------------------------------------------------------------------- |
| API task definition | `forge-development-ecs-platform-api:28`                                   |
| API image tag       | `config-accept-20260728092807`                                            |
| API image digest    | `sha256:60572176a163fd7d2cab70e81aa6a9d28fbba76c5c1c72f337fa9eed86802bff` |
| Worker              | unchanged `:19` / `closeout-20260727125918`                               |
| Migration 0021      | APPLIED                                                                   |
| Creator Console     | `https://ddztl9s33wu40.cloudfront.net` (`EUY00O1FSF7BG`)                  |
| Tenant Admin        | `https://d1uxdl4szvsixc.cloudfront.net` (`E3O4NP8GCEEK23`)                |
| App DB secret       | unchanged (no rotation)                                                   |

## Catalog / lifecycle

| Gate                                  | Result                                                                       |
| ------------------------------------- | ---------------------------------------------------------------------------- |
| GET /health                           | 200                                                                          |
| Catalog Creator / unauth / no-config  | 200 / 401 / 403                                                              |
| Live lifecycle + 27-module validation | PASS / **27/0**                                                              |
| Config import dry-run                 | **PASS** (validation only; `persisted: false`; conflict + validation report) |
| Historical config versions            | PASS (RMS submission snapshots N/A)                                          |

## Tenant isolation

| Layer  | Result                         |
| ------ | ------------------------------ |
| API    | 13/13 deny                     |
| DB RLS | PASS (`config-rls-verify.mjs`) |

## Authorization totals

|          |                                                                        |
| -------- | ---------------------------------------------------------------------- |
| Cases    | **22**                                                                 |
| Passed   | **22**                                                                 |
| Failed   | **0**                                                                  |
| Skipped  | **0**                                                                  |
| Evidence | `docs/testing/evidence/config-final-acceptance/authz-matrix-full.json` |

Personas seeded on `rms-synthetic-fd`: Platform Support, Tenant Admin (`tenant.configuration.*` only), Configuration Manager, Read-only Auditor, Standard User, plus update-only / publish-only probes.

## Playwright / accessibility totals

|                    |                                     |
| ------------------ | ----------------------------------- |
| configuration-e2e  | **5 passed / 0 failed / 0 skipped** |
| Axe critical       | **0**                               |
| Manual WCAG 2.2 AA | **Incomplete** (spot only)          |

## Monitoring

| Item                  | Status                                                                                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dashboard             | `forge-development-configuration-platform` (includes EMF widget)                                                                                        |
| ECS CPU/Memory alarms | Present                                                                                                                                                 |
| EMF metrics           | `ConfigRlsDenials`, `ConfigAuthorizationDenials`, `ConfigPublishFailures`, `ConfigRollbackFailures`, `ConfigValidationFailures` (`Forge/Configuration`) |
| EMF alarms            | Five alarms provisioned (may be `INSUFFICIENT_DATA` until traffic)                                                                                      |

## Regression totals

|                                                                                                   |             |
| ------------------------------------------------------------------------------------------------- | ----------- |
| Executed Configuration Platform gate failures                                                     | **0**       |
| Authz failures                                                                                    | **0**       |
| Config e2e failures                                                                               | **0**       |
| Full required regression (Phase 2/3/4 + AI + monorepo lint/typecheck/integration) 0 fail / 0 skip | **NOT MET** |

## Remaining limitations

1. Full Phase 2 / Phase 3 / NERIS Phase 4 / AI Foundation Playwright + integration not re-executed this sprint (skipped).
2. Monorepo lint/typecheck failed on unrelated `@forge/rms-web` / `@forge/rms-web-e2e` issues.
3. Manual WCAG 2.2 AA matrix incomplete.
4. Studio modules remain OPERATIONAL_GENERIC_EDITOR (no rich builders).
5. Platform Support time-limited session machinery not operationalized (permissions seeded; TTL workflow incomplete).
6. Role/permission studio payloads are not yet bridged to live authz tables.

## Rollback references

| Component             | Rollback target                                                                                                    |
| --------------------- | ------------------------------------------------------------------------------------------------------------------ |
| API (immediate prior) | `:27` / `config-accept-20260728054933` / `sha256:f0f139ec3930f98ca621e9b9f7032c7e395cde3915b5cd990f42a58b64806d00` |
| API (earlier)         | `:26` / `ai-ops-20260728052254`                                                                                    |
| Current retain        | `:28` / `config-accept-20260728092807` / `sha256:60572176a163fd7d2cab70e81aa6a9d28fbba76c5c1c72f337fa9eed86802bff` |
| Worker                | `:19` / `closeout-20260727125918`                                                                                  |
| Secret                | do not rotate                                                                                                      |

## Import Platform

**NOT STARTED** — awaiting explicit product-owner authorization.
