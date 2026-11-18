# Universal Import Platform — Data Model

**Status:** S1  
**Date:** 2026-07-28

## Entities

`import_jobs`, `import_files`, `import_profiles`, `import_column_mappings`, `import_rows`, `import_row_errors`, `import_duplicate_candidates`, `import_batches`, `import_rollback_events`

## Required columns (every tenant-owned import table)

`id`, `tenant_id`, `created_at`, `created_by`, `updated_at`, `updated_by`, `version`

## Lifecycle / retention columns (where applicable)

`archived_at`, `archived_by`, `effective_at`, `completed_at`, `expires_at`, `retention_delete_at`, `correlation_id`, `source_hash`, `idempotency_key`

## Job status

Canonical enum — see `IMPORT_WORKFLOW.md`. Stored as `varchar` with CHECK constraint.

## Idempotency

| Table            | Key                                                          |
| ---------------- | ------------------------------------------------------------ |
| `import_jobs`    | UNIQUE `(tenant_id, idempotency_key)` WHERE NOT NULL         |
| `import_batches` | UNIQUE `(tenant_id, job_id, idempotency_key)` WHERE NOT NULL |
| `import_rows`    | UNIQUE `(tenant_id, job_id, operation_key)` WHERE NOT NULL   |
| API layer        | Existing platform `idempotency_records`                      |

## Row payload policy

- `mapped_json` required after mapping; size ≤ 65536 bytes
- `raw_json` nullable truncated; `raw_s3_key` preferred for full source row
- `contains_sensitive` boolean
- `retention_delete_at` for cleanup eligibility

## Product adapter

`ProductModuleRef` + adapter interface in architecture doc; no product tables in S1.

## Rollback events

Store safety class, outcome, entity id list (no sensitive payloads).
