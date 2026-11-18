# Migration 0022 — Import Platform Review

**Date:** 2026-07-28  
**File:** `packages/database/drizzle/0022_import_platform.sql`  
**Checksum (sha256):** `28d25b49406b9c248cedb8ef9a6ed4e017cb218d5003b6ac2609a2dd5c2d2054`

## Checklist

| Check                        | Result                                                                                        |
| ---------------------------- | --------------------------------------------------------------------------------------------- |
| Additive CREATE only         | PASS — no DROP TABLE / TRUNCATE                                                               |
| Foreign keys                 | PASS — tenants, users, self-refs, job children                                                |
| Unique constraints / indexes | PASS — idempotency, profile key, job source row, batch number                                 |
| CHECK / ENUM                 | PASS — `import_job_status`, `import_rollback_safety`, scan status, severity, mapped_json size |
| FORCE RLS + WITH CHECK       | PASS — all 9 tables                                                                           |
| forge_app grants under RLS   | PASS                                                                                          |
| Concurrent-safe              | PASS — IF NOT EXISTS / exception handlers for types                                           |
| Destructive ops              | NONE                                                                                          |
| App secret rotation required | NO                                                                                            |

## Verdict

**SAFE_TO_APPLY**

Limitations: enums are PostgreSQL types (forward-compatible via ADD VALUE in later migrations if needed); `mapped_json` size check uses `pg_column_size`.
