# Migration 0021 — Configuration Platform verification

**File:** `packages/database/drizzle/0021_configuration_platform.sql`  
**Date reviewed:** 2026-07-28  
**Method:** Static SQL review + drizzle journal inclusion. Aurora apply status recorded separately in acceptance report.

## Additive vs destructive

| Check                                 | Result                                     |
| ------------------------------------- | ------------------------------------------ |
| CREATE TABLE IF NOT EXISTS            | PASS (`config_objects`, `config_versions`) |
| DROP TABLE / TRUNCATE / DELETE data   | PASS (none)                                |
| ALTER DROP COLUMN                     | PASS (none)                                |
| DROP POLICY IF EXISTS + CREATE POLICY | PASS (expected idempotent RLS)             |
| DROP CONSTRAINT IF EXISTS + ADD FK    | PASS (version pointer FK)                  |

**Verdict:** Additive schema migration. Safe to apply once; do not reapply destructively.

## Required columns

| Requirement     | `config_objects`                            | `config_versions`                                                      |
| --------------- | ------------------------------------------- | ---------------------------------------------------------------------- |
| tenant_id       | PASS NOT NULL + FK tenants                  | PASS NOT NULL + FK tenants                                             |
| created_at      | PASS                                        | PASS                                                                   |
| updated_at      | PASS                                        | PASS                                                                   |
| created_by      | LIMITATION — absent on objects              | PASS `created_by_user_id`                                              |
| updated_by      | LIMITATION — absent                         | LIMITATION — use `published_by_user_id` for publish only               |
| version         | N/A (object) / `record_version` concurrency | PASS integer `version` + `record_version`                              |
| archived fields | via version `state=ARCHIVED`                | PASS state machine (no separate archived_at)                           |
| effective dates | N/A                                         | PASS `effective_from`, `effective_to`, `scheduled_for`, `published_at` |

## RLS

| Check                     | Result                                                                                                                                                                       |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ENABLE ROW LEVEL SECURITY | PASS both tables                                                                                                                                                             |
| FORCE ROW LEVEL SECURITY  | PASS both tables                                                                                                                                                             |
| Tenant predicate          | PASS `tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid`                                                                                          |
| WITH CHECK                | PASS same predicate                                                                                                                                                          |
| forge_app bypass          | PASS by design — policies do not grant bypass; runtime uses `withTenantTransaction` session GUC. Tables listed in `TENANT_RLS_TABLES` in `packages/database/src/rls.sql.ts`. |

## Indexes and uniqueness

| Index                                 | Purpose                            | Result                                   |
| ------------------------------------- | ---------------------------------- | ---------------------------------------- |
| `config_objects_tenant_ns_key_uidx`   | unique tenant+namespace+object_key | PASS                                     |
| `config_objects_tenant_ns_idx`        | list by tenant/namespace           | PASS                                     |
| `config_versions_object_version_uidx` | unique object+version              | PASS                                     |
| `config_versions_tenant_state_idx`    | tenant+state+created_at            | PASS                                     |
| `config_versions_object_state_idx`    | object+state                       | PASS                                     |
| effective-date index                  | query by effective_from/to         | LIMITATION — not present (filter in app) |

## Foreign keys / version integrity

| FK                                                     | Result                   |
| ------------------------------------------------------ | ------------------------ |
| objects.tenant_id → tenants                            | PASS                     |
| versions.tenant_id → tenants                           | PASS                     |
| versions.object_id → config_objects                    | PASS                     |
| versions.created_by_user_id → users                    | PASS                     |
| versions.published_by_user_id → users                  | PASS                     |
| versions.supersedes_version_id → config_versions       | PASS (nullable self-ref) |
| objects.current_published_version_id → config_versions | PASS                     |

## Aurora apply status

**CONFIRMED 2026-07-28:** ECS migrate on `config-accept-20260728054933` / task def `:27` exited 0; `config_objects` / `config_versions` live (ensure-defaults + draft **201**). Earlier checkpoint UNKNOWN and first migrate on `:26` (through 0020 only) are superseded. Do not reapply destructively.
