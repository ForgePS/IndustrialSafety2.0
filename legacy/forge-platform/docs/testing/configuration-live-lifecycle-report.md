# Configuration live lifecycle report

**Date:** 2026-07-28  
**Environment:** development (`511343547817` / `us-east-1`)  
**API:** `https://d108fstxdv69bo.cloudfront.net`  
**Task definition:** `forge-development-ecs-platform-api:27`  
**Image:** `config-accept-20260728054933`  
**Digest:** `sha256:f0f139ec3930f98ca621e9b9f7032c7e395cde3915b5cd990f42a58b64806d00`  
**Evidence:** `docs/testing/evidence/config-final-acceptance/`  
**Harness:** `scripts/config-final-acceptance.mjs` (exit 0)

## Tenant under test

| Label                              | Tenant ID                                                            | Notes                                                                                  |
| ---------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| config-acceptance-tenant-a (alias) | `019f9e06-a0b2-75f4-9e0b-5ae9befd8193`                               | Existing `rms-synthetic-fd` — `POST /platform/tenants` returns 500 under forge_app RLS |
| Actor                              | Platform admin `019f9c33-288e-…` / platform tenant `019f9c33-2875-…` | TenantGuard platform-admin bypass                                                      |

## Results

| Step                | Result          | Notes                                                  |
| ------------------- | --------------- | ------------------------------------------------------ |
| Create draft        | PASS            | terminology v5 DRAFT                                   |
| Retrieve draft      | PASS            | 200                                                    |
| Update draft        | PASS            | content hash updated                                   |
| Validate draft      | PASS            | Zod on create/patch                                    |
| Publish             | PASS            | 201 PUBLISHED                                          |
| Effective resolve   | PASS            | source=published                                       |
| Second draft        | PASS            | v6                                                     |
| Compare             | PASS            | 1 diff (`from`/`to` query params)                      |
| Schedule            | PASS            | SCHEDULED future                                       |
| Not effective early | PASS            | effective stayed on prior published                    |
| Activate scheduled  | PASS            | publish SCHEDULED → PUBLISHED                          |
| Archive             | PASS            | archive DRAFT (SUPERSEDED→ARCHIVED rejected by design) |
| Rollback            | PASS            | new version 8 id ≠ prior                               |
| Export              | PASS            | `forge.config.bundle.v1`                               |
| Dry-run import      | NOT_IMPLEMENTED | limitation                                             |
| Valid import        | PASS            | branding/imported                                      |
| Invalid import      | PASS            | 400 VALIDATION_FAILED                                  |
| Unauthorized        | PASS            | 401                                                    |
| Immutable published | PASS            | 409 CONFLICT on patch                                  |

**Verdict:** PASS with limitations (dry-run import absent; new synthetic tenant create API blocked by RLS).
