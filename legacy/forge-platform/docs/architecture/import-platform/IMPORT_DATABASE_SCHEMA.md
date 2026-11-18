# Universal Import Platform — Database Schema

**Status:** S1 finalized SQL (`0022`) — apply pending confirmation  
**Migration:** `packages/database/drizzle/0022_import_platform.sql`  
**Checksum:** `28d25b49406b9c248cedb8ef9a6ed4e017cb218d5003b6ac2609a2dd5c2d2054`

## Tables

All tenant-owned with `id`, `tenant_id`, `created_at`, `created_by`, `updated_at`, `updated_by`, `version` plus retention/idempotency columns where applicable.

| Table                         | Notes                                                                                             |
| ----------------------------- | ------------------------------------------------------------------------------------------------- |
| `import_profiles`             | Snapshots / working copies; Config Studio remains SoT for definitions                             |
| `import_jobs`                 | Status ENUM `import_job_status`; rollback_safety ENUM                                             |
| `import_files`                | S3 refs; scan_status fail-closed values                                                           |
| `import_column_mappings`      | `is_sensitive` flag                                                                               |
| `import_batches`              | Batch idempotency unique                                                                          |
| `import_rows`                 | `operation_key`, `mapped_json` ≤ 64KiB, `raw_s3_key`, `contains_sensitive`, `retention_delete_at` |
| `import_row_errors`           | Non-silent errors                                                                                 |
| `import_duplicate_candidates` | Confidence 0–1                                                                                    |
| `import_rollback_events`      | Safety class required                                                                             |

## RLS

ENABLE + FORCE + USING/WITH CHECK on `app.current_tenant_id` for every table. `forge_app` DML granted under RLS.
