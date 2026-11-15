# Import Platform — Sprint S1 Summary

**Date:** 2026-07-28  
**Status:** **ACCEPTED**  
**Phase 5 / Roadmap Phase 12:** foundation complete; product import engine not complete  
**Do not start S2 until explicitly kicked off.**

## Objectives

Establish secure database and authorization foundation for Universal Import Platform: finalize/apply `0022`, FORCE RLS, seed `import.*` permissions, audit event definitions, isolation tests, documentation.

## Architecture conditions resolved

Documented in architecture package:

- Canonical job state machine (20 statuses)
- Explicit unscoped permissions (`import.view` … `import.sensitive`)
- Rollback safety classifications (SAFE/CONDITIONAL/UNSAFE/EXPIRED)
- Sensitive row storage / retention / masking
- Malware fail-closed (`SCAN_FAILED`)
- API/job/batch/row idempotency
- Product adapter interface (no product adapters implemented)

## Migration result

| Item              | Value                                                                |
| ----------------- | -------------------------------------------------------------------- |
| Review            | **SAFE_TO_APPLY**                                                    |
| Checksum          | `28d25b49406b9c248cedb8ef9a6ed4e017cb218d5003b6ac2609a2dd5c2d2054`   |
| Ledger            | id `232`, hash **MATCH**                                             |
| Migrate image     | `import-s1-live-20260728170110` / `sha256:194364b67ae9…` on TD `:31` |
| Task ARN          | `…/5c11901ac2d34a41aef9dbc86cecb0cc`                                 |
| Exit code         | **0**                                                                |
| Applied to Aurora | **YES**                                                              |

Apply report: [0022-import-platform-apply-report.md](../database/0022-import-platform-apply-report.md)

## Database objects (live)

Nine tables verified in Aurora catalog with `tenant_id`, audit fields, `version`, ENABLE + **FORCE** RLS, and tenant policies:

`import_jobs`, `import_files`, `import_profiles`, `import_column_mappings`, `import_rows`, `import_row_errors`, `import_duplicate_candidates`, `import_batches`, `import_rollback_events`

Enums: `import_job_status`, `import_rollback_safety`

## RLS result

Live ECS matrix as `forge_app`: **`ok: true`**, **45/45**, 0 cross-tenant reads/writes, 0 metadata leakage, 0 RLS bypass.

Report: [import-platform-tenant-isolation-report.md](../security/import-platform-tenant-isolation-report.md)

## Authorization result

Live seed: **12** `import.*` permissions. Tenant-admin exclusions for sensitive/template.manage. No Nest route matrix (S2).

Report: [import-platform-authorization-report.md](../security/import-platform-authorization-report.md)

## Application role security

| Check                 | Result |
| --------------------- | ------ |
| `forge_app` superuser | false  |
| `forge_app` BYPASSRLS | false  |
| Cannot disable RLS    | PASS   |

## Secret integrity

`forge-development-secrets-database-app` ARN unchanged; `LastChangedDate` unchanged (`2026-07-26T15:30:16.387000-05:00`).

## Acceptance data policy

**RETAIN** synthetic tenants `import-acceptance-tenant-a` / `import-acceptance-tenant-b` for future RLS regression. Isolated keys only; no real customer data; no hard-delete of audit rows.

## Test totals

| Suite                               | Passed       | Failed | Skipped |
| ----------------------------------- | ------------ | ------ | ------- |
| `@forge/imports` unit               | 7            | 0      | 0       |
| `@forge/database` 0022 + perms unit | 6            | 0      | 0       |
| `@forge/events` import events unit  | 1            | 0      | 0       |
| Live migrate                        | 1            | 0      | 0       |
| Live permission seed                | 1 (12 codes) | 0      | 0       |
| Live acceptance seed                | 1            | 0      | 0       |
| Live catalog verify                 | 1            | 0      | 0       |
| Live RLS matrix                     | 45           | 0      | 0       |

**S1:** 0 failed. 0 security tests skipped. API route matrix deferred by design (S2).

## Known limitations

1. No Nest import APIs / presigned upload (S2).
2. No malware scanner wiring.
3. No Drizzle TS table definitions yet (SQL + live catalog).
4. Concurrent API TD churn during live bake (`:31` migrate / `:32` service observed); worker `:19` unchanged; no import product HTTP behavior.
5. Phase 5 product import engine incomplete until later sprints.

## Rollback state

Checkpoint: [import-platform-s1-checkpoint.json](./import-platform-s1-checkpoint.json). Prior API `:28` Config baseline retained as rollback reference; worker `:19` unchanged; schema additive-only.

## Recommendation for S2

**S2 is authorized from an S1 foundation perspective** (migrate + FORCE RLS + 12 permissions + live isolation PASS).

Do **not** auto-start S2. Kick off only with an explicit directive for Nest import routes and presigned upload. Do not implement CSV/XLSX processors or product adapters in S2 kickoff without further scope.
