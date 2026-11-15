# Migration 0022 — Apply Report (Development)

**Date:** 2026-07-28  
**Verdict:** **APPLIED**  
**Migration:** `packages/database/drizzle/0022_import_platform.sql`  
**Checksum (sha256):** `28d25b49406b9c248cedb8ef9a6ed4e017cb218d5003b6ac2609a2dd5c2d2054`  
**Ledger confirmation:** hash `28d25b49406b9c248cedb8ef9a6ed4e017cb218d5003b6ac2609a2dd5c2d2054` recorded (ledger id `232`)  
**Review verdict:** SAFE_TO_APPLY (`docs/database/0022-import-platform-review.md`)

## AWS identity (apply session)

| Field            | Value                                                                                                 |
| ---------------- | ----------------------------------------------------------------------------------------------------- |
| Account          | `511343547817`                                                                                        |
| Assumed role ARN | `arn:aws:sts::511343547817:assumed-role/AWSReservedSSO_ForgeDeployAdmin_4e3cbf93096d93f3/forge-admin` |
| Profile          | `forge-dev`                                                                                           |
| Region           | `us-east-1`                                                                                           |
| Auth timestamp   | `2026-07-28T16:54:05-05:00`                                                                           |

## Image bake (live apply)

| Item                              | Value                                                                                                           |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Image tag (migrate TD)            | `import-s1-live-20260728170110`                                                                                 |
| Digest (migrate TD)               | `sha256:194364b67ae9f45af0e6c98fb9f822d0fd11c0a0b3c79c494f3639396b9eb781`                                       |
| Prior bake (mid-sprint reference) | `import-s1-20260728140146` / `sha256:c19338e968eaf774d3bdedd8c1f82134490e64aa26c80d854d7589f953c61f90`          |
| ECR                               | `511343547817.dkr.ecr.us-east-1.amazonaws.com/forge-development-ecr-platformapi`                                |
| Migrate task definition           | `forge-development-ecs-platform-api:31`                                                                         |
| Service TD after concurrent bake  | `forge-development-ecs-platform-api:32` (`import-s1-live-20260728171038`)                                       |
| Worker                            | unchanged `:19`                                                                                                 |
| SQL checksum                      | **MATCH** approved `28d25b49…2054` (image digest differs from mid-sprint bake; SQL content verified via ledger) |

## Apply execution

| Field                         | Value                                                                                                     |
| ----------------------------- | --------------------------------------------------------------------------------------------------------- |
| Process                       | `node scripts/run-ecs-migrate.mjs`                                                                        |
| Role / secret                 | `forge_admin` via `forge-development-secrets-database` (not app secret)                                   |
| Cluster                       | `forge-development-ecs-platform`                                                                          |
| Subnet                        | `subnet-09971b07b33602377` (ENI `eni-0ddd51c37a56efd1e`, private IP `10.20.2.27`)                         |
| Security group                | `sg-0eb77db55e2f9b433` (service awsvpc)                                                                   |
| Task ARN                      | `arn:aws:ecs:us-east-1:511343547817:task/forge-development-ecs-platform/5c11901ac2d34a41aef9dbc86cecb0cc` |
| Task definition ARN           | `arn:aws:ecs:us-east-1:511343547817:task-definition/forge-development-ecs-platform-api:31`                |
| startedAt                     | `2026-07-28T17:13:16.241000-05:00`                                                                        |
| stoppedAt                     | `2026-07-28T17:13:45.706000-05:00`                                                                        |
| Stop code / reason            | `EssentialContainerExited` / Essential container in task exited                                           |
| Essential container exit code | **0**                                                                                                     |
| CloudWatch log group          | `/forge/development/platform-api`                                                                         |
| Log stream                    | `platform-api/platform-api/5c11901ac2d34a41aef9dbc86cecb0cc`                                              |
| Result payload                | `{"status":"migrated",…}`                                                                                 |
| Evidence                      | `docs/testing/evidence/import-platform/s1-migrate.json`                                                   |

## Warnings

1. PostgreSQL NOTICE `42P06` / `42P07`: drizzle schema and `__drizzle_migrations` already exist (expected skip).
2. Concurrent API TD churn during live bake: pre-apply observed `:30`, migrate used `:31`, service later on `:32`. Worker remained `:19`. No product import API behavior shipped.
3. Mid-sprint checkpoint referenced image digest `sha256:c19338e968ea…`; live migrate used rebuild `sha256:194364b67ae9…`. **SQL checksum** is the acceptance gate and matches.

## Database object verification (live catalog)

Queried via `run-ecs-import-catalog-verify.mjs` as `forge_admin`. Evidence: `s1-catalog.json`.

| Table                         | tenant_id | PK / audit / version | ENABLE RLS | FORCE RLS | Tenant policy |
| ----------------------------- | --------- | -------------------- | ---------- | --------- | ------------- |
| `import_profiles`             | yes       | yes                  | yes        | yes       | yes           |
| `import_jobs`                 | yes       | yes                  | yes        | yes       | yes           |
| `import_files`                | yes       | yes                  | yes        | yes       | yes           |
| `import_column_mappings`      | yes       | yes                  | yes        | yes       | yes           |
| `import_batches`              | yes       | yes                  | yes        | yes       | yes           |
| `import_rows`                 | yes       | yes                  | yes        | yes       | yes           |
| `import_row_errors`           | yes       | yes                  | yes        | yes       | yes           |
| `import_duplicate_candidates` | yes       | yes                  | yes        | yes       | yes           |
| `import_rollback_events`      | yes       | yes                  | yes        | yes       | yes           |

Enums confirmed live: `import_job_status` (20 values including `UPLOADED`…`CANCELLED`), `import_rollback_safety` (`SAFE`/`CONDITIONAL`/`UNSAFE`/`EXPIRED`).

## RLS verification

| Metric              | Value                                                      |
| ------------------- | ---------------------------------------------------------- |
| Verifier            | `import-rls-verify.mjs` as `forge_app`                     |
| Result              | `ok: true`                                                 |
| Cases               | 45 / 45 passed                                             |
| Cross-tenant reads  | 0                                                          |
| Cross-tenant writes | 0                                                          |
| Metadata leakage    | 0                                                          |
| RLS bypass          | 0                                                          |
| Unexpected passes   | 0                                                          |
| Evidence            | `docs/testing/evidence/import-platform/s1-rls-verify.json` |

## Secret integrity

| Field                   | Value                                                                                                |
| ----------------------- | ---------------------------------------------------------------------------------------------------- |
| App secret name         | `forge-development-secrets-database-app`                                                             |
| ARN                     | `arn:aws:secretsmanager:us-east-1:511343547817:secret:forge-development-secrets-database-app-SknUu5` |
| LastChangedDate (pre)   | `2026-07-26T15:30:16.387000-05:00`                                                                   |
| LastChangedDate (post)  | `2026-07-26T15:30:16.387000-05:00`                                                                   |
| Rotated / value changed | **No**                                                                                               |

## Seeds (post-migrate)

| Step                | Task                                 | Exit              |
| ------------------- | ------------------------------------ | ----------------- |
| Permissions         | `…/e2737e989b7a4a71b6ea24c0d7a88c3e` | 0 — 12 `import.*` |
| Acceptance fixtures | `…/a09f9be4975e4545975ff8b07f5aa482` | 0 — tenants A/B   |
| Catalog verify      | `…/5c2511c208174b72a59665a405847f1e` | 0                 |

## Rollback considerations

- Migration is additive CREATE TABLE / ENUM / RLS only.
- Schema rollback (if ever required): restore Aurora snapshot from before apply; do **not** DROP live tables without change ticket.
- Application rollback reference: prior Config baseline API `:28` / `config-accept-20260728092807`; worker `:19` untouched.
- Acceptance tenants retained for regression (see S1 summary).
