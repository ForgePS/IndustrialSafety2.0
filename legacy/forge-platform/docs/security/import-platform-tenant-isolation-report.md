# Import Platform — Tenant Isolation Report (S1 + S2)

**Date:** 2026-07-28  
**S1 DB verdict:** PASS (`ok: true`, 45/45)  
**S2 API verdict:** PASS (local e2e; live deploy evidence pending/see S2 checkpoint)

## S1 database matrix (Aurora)

See prior S1 section evidence: `docs/testing/evidence/import-platform/s1-rls-verify.json`.

| Metric                    | Value       |
| ------------------------- | ----------- |
| Role                      | `forge_app` |
| Cases                     | 45 / 45     |
| Cross-tenant reads/writes | 0 / 0       |
| Final `ok`                | true        |

## S2 API matrix (Nest `/api/v1/imports`)

| Case                                  | Result                            |
| ------------------------------------- | --------------------------------- |
| Tenant A create/list/get own job      | PASS                              |
| Tenant B GET Tenant A job UUID        | 404 `IMPORT_JOB_NOT_FOUND`        |
| Guessed UUID                          | 404                               |
| Tenant B PUT mappings on Tenant A job | 404                               |
| Tenant B GET Tenant A profile         | 404                               |
| Missing auth                          | 401                               |
| Permission denial (view-only create)  | 403                               |
| Entitlement denial (wrong product)    | 403 `IMPORT_ENTITLEMENT_REQUIRED` |

Evidence: `apps/platform-api/src/imports.e2e.test.ts` (local) + live smoke after deploy.
