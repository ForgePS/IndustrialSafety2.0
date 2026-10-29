# PROD-S0R — Production schema / migration readiness

**Cluster:** `forge-production-rds-aurora` (empty foundation)  
**Migrations in PROD-S0R:** NOT APPLIED (intentional)  
**Customer data:** none

## Versions

| Field                       | Value                                                                 |
| --------------------------- | --------------------------------------------------------------------- |
| CURRENT_PROD_SCHEMA_VERSION | `none` / empty cluster (no drizzle `__drizzle_migrations` applied)    |
| TARGET_SCHEMA_VERSION       | `0038_mk_s21_security_hardening` (journal idx 38 on remediation line) |
| PENDING_MIGRATIONS          | Full ordered set `0000` → `0038` under `packages/database/drizzle`    |

## Planned PROD-S1 migration sequence

1. Snapshot cluster (`forge-production-pre-migrate-YYYYMMDDHHMM`).
2. Resolve app DB secret `forge-production-secrets-database-app` endpoint/credentials (no secret values in docs/chat).
3. Run the repository migration entrypoint used by ECS one-off / `migrate-ecs` against production (exact package script on RELEASE_SHA).
4. `pnpm` / migrate-status: confirm journal matches TARGET.
5. Failure stop: leave pre-migrate snapshot; do not continue Compute app cutover; restore per `PROD-S0R-backup-restore.md`.

## Rollback compatibility

- Prefer restore-to-new-cluster from pre-migrate snapshot, then repoint secret/ECS.
- Do not delete the failed cluster until verification window closes.
- Forward-only SQL migrations must be reviewed for destructive DDL before PROD-S1.

## Classification

**DATABASE_MIGRATIONS = READY** (sequence documented; execution deferred to PROD-S1)
