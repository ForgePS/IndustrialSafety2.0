# Training Portal — Development DB Migration Diagnosis

**Date:** 2026-08-23  
**Checkpoint:** `FORGE-INDUSTRIAL-TRAINING-PORTAL`

## Summary

Development Aurora cannot reach training/LMS migrations (0062–0063) because the database is on a **legacy industrial schema** that predates `0040_industrial_domain_s1.sql`. The Drizzle ledger stops at **0028** while partial industrial tables were created outside the migration chain.

Production is healthy at **0061** (0062/0063 pending) and was **not modified** during this diagnosis.

## Evidence

### Ledger (development)

| Metric                  | Value                                      |
| ----------------------- | ------------------------------------------ |
| Applied journal entries | 0–28 (`0000` … `0028_mk_s1_tenant_domain`) |
| Missing                 | `0029` … `0063` (35 migrations)            |
| High-water `created_at` | `1754800000000`                            |

### Schema drift (`industrial_sites`)

Development `industrial_sites` is **not** the 0040 Model A table:

| Expected (0040)             | Present on dev                                                               |
| --------------------------- | ---------------------------------------------------------------------------- |
| `site_key`                  | **missing** — has `site_code` instead                                        |
| `timezone`, address columns | **missing**                                                                  |
| `source_payload` jsonb      | **missing** — has `custom_fields_json`                                       |
| —                           | `migration_batch_id`, `created_by`, `record_version`, … (import-era columns) |

Indexes on dev: `industrial_sites_pkey`, `industrial_sites_tenant_source_uidx`  
0040 expects: `industrial_sites_tenant_key_uidx` on `site_key` → **fails when migrate runs 0040**

### Training tables (development)

**None present** — all null:

- `industrial_training_sources` … `industrial_training_completions`
- `industrial_training_portal_sessions` (0062)
- `industrial_training_access_links` (0063)

### Migrate failure

`node scripts/run-ecs-migrate.mjs --env development` fails on **`0040_industrial_domain_s1`** (`DrizzleQueryError`). Root cause: `CREATE TABLE IF NOT EXISTS industrial_sites` skips (table exists), then index/DDL steps reference columns that do not exist on the legacy table.

### Production (read-only audit)

- Ledger through **0061** applied
- Missing: **0062**, **0063** only
- `industrial_positions` and full Model A industrial stack present

## Recommended course of action

### Path A — Fix development Aurora (team-wide dev unblock)

Best when other industrial features also need a current dev DB.

1. **Rebuild or restore** development Aurora from a snapshot that matches production’s Model A lineage (post-0040), **or**
2. Run a controlled **schema alignment** script (rename `site_code` → `site_key`, add missing columns, reconcile indexes) then stamp ledger through 0040 before re-running migrate.

After dev matches production lineage:

```bash
node scripts/run-ecs-migrate.mjs --env development   # through 0063
node scripts/seed-industrial-training-demo.mjs
node scripts/seed-industrial-training-uat.mjs
```

Requires infra/DBA sign-off for restore or alignment.

### Path B — Local UAT (fastest for training portal proof)

Best to validate LMS code **without** fixing shared dev Aurora first.

```bash
docker start forge-platform-postgres   # if needed
pnpm db:migrate
pnpm db:seed
node scripts/run-local-training-uat.mjs
# opens .local-training-uat.json with portalUrl — then run platform-api + industrial-web locally
```

### Path C — Staging deploy (after A or B proves UAT)

1. Commit LMS-only changes on `industrial/training-employee-portal`
2. Deploy API image containing 0063 to **development/staging** ECS
3. `node scripts/run-ecs-migrate.mjs --env development` (only after Path A)
4. Smoke-test `/training/access/{token}` and admin QR/QC panels

**Do not** apply 0062/0063 to production until explicit authorization and staging UAT pass.

## Diagnostic scripts added

| Script                                                | Purpose                                 |
| ----------------------------------------------------- | --------------------------------------- |
| `scripts/audit-migration-state.mjs --env development` | Ledger vs journal                       |
| `scripts/audit-dev-training-schema.mjs`               | Training/LMS table presence             |
| `scripts/diag-dev-industrial-sites-drift.mjs`         | `industrial_sites` column/index drift   |
| `scripts/run-local-training-uat.mjs`                  | One-shot local demo + UAT seed + verify |
| `scripts/verify-local-training-uat.mjs`               | Assert John Smith / LOTO seed rows      |

## Decision

| Environment            | Action now                                                    |
| ---------------------- | ------------------------------------------------------------- |
| **Production**         | No changes (0062 already applied earlier; 0063 wait for auth) |
| **Development Aurora** | Needs Path A restore/alignment before ECS migrate             |
| **Local Docker**       | Path B — recommended immediate UAT                            |
| **LMS code**           | Ready; commit when UAT passes                                 |
