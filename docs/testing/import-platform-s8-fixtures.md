# Import Platform S8 — Fixtures

**Document:** `docs/testing/import-platform-s8-fixtures.md`  
**Date:** 2026-07-30  
**Status:** SEEDED on development acceptance tenants

## Purpose

Synthetic fixtures for S8 P1 evidence. No passwords or tokens stored here.

## Tenants

| Key      | Tenant ID                              | Slug                         |
| -------- | -------------------------------------- | ---------------------------- |
| Tenant A | `019faa15-e558-70b6-adcd-a510c3c995f4` | `import-acceptance-tenant-a` |
| Tenant B | `019faa15-e578-76bd-b269-038d23c03b5e` | `import-acceptance-tenant-b` |

## Personas (seeded 2026-07-30)

Evidence: `docs/testing/evidence/import-platform/s8-personas-seed.json`  
Seed: `scripts/seed-import-s8-personas-compact.mjs` via `scripts/run-ecs-seed-import-s8-personas-inject.mjs`  
DB secret: admin migrate secret only (`forge-development-secrets-database`) — app secret unchanged.

| Persona key  | Role                   | Tenant A userId (synthetic)            |
| ------------ | ---------------------- | -------------------------------------- |
| operator     | S8_IMPORT_OPERATOR     | `c6d951ba-f79a-4d4d-97ab-0bc6a5fda697` |
| approver     | S8_IMPORT_APPROVER     | `72130d76-d1ed-4bd9-9133-2ce261846d5f` |
| executor     | S8_IMPORT_EXECUTOR     | `12852475-b307-41ac-b1dd-739e861643d5` |
| full         | S8_IMPORT_FULL         | `e69b060f-3759-425a-bf31-92f6a75d1cbb` |
| viewer       | S8_IMPORT_VIEWER       | `dd3ba45a-59e5-49d8-a11a-0316469e0366` |
| sensitive    | S8_IMPORT_SENSITIVE    | `0c561737-2c69-449b-b82c-1acd59c66ef2` |
| rollback     | S8_IMPORT_ROLLBACK     | `10cc9174-2b89-45bd-838d-c53e8201d12b` |
| reprocess    | S8_IMPORT_REPROCESS    | `c4963657-eeb1-4c3a-915c-806993cb61f8` |
| unauthorized | S8_IMPORT_UNAUTHORIZED | `384092f1-a829-4005-b74f-37e8ce321b5a` |

Tenant B personas use the same emails with distinct userIds (see seed JSON).

**Auth for development evidence:** `X-Forge-Dev-Principal: {"userId","tenantId"}` (no Cognito passwords in docs).

## Neutral adapter

| Item        | Value                                                                                                                  |
| ----------- | ---------------------------------------------------------------------------------------------------------------------- |
| Adapter key | `reference:generic:record@1`                                                                                           |
| Notes       | Product adapter keys are not registered until S9. Execute must pass this key (or API default after DEF-S8-024 deploy). |

## Seed / cleanup

| Action                         | Command                                                          |
| ------------------------------ | ---------------------------------------------------------------- |
| Build database package         | `pnpm --filter @forge/database build`                            |
| Seed personas (ECS inject)     | `node scripts/run-ecs-seed-import-s8-personas-inject.mjs`        |
| Acceptance tenants (if needed) | `node scripts/run-ecs-seed-import-acceptance.mjs`                |
| Cleanup                        | Manual archival of synthetic jobs preferred; do not drop tenants |

## File fixtures (synthetic)

| Fixture                              | Use                                                                                                                                     |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| Unique clean CSV (runtime-generated) | Happy-path upload (`scripts/import-s8-authenticated-workflow.mjs`)                                                                      |
| Canaries                             | `S8-TEST-SSN-999-88-7777`, `S8-TEST-FEMA-123456`, `S8-TEST-CREDENTIAL-DO-NOT-EXPOSE`, `S8-TEST-BANK-00001111`, `S8-TEST-MEDICAL-CANARY` |

Large-row datasets for Aurora matrix: **not yet generated** (DEF-S8-015 open).

## Smoke verification

- Operator `/api/v1/auth/me` → HTTP 200 with import permissions
- CF OPTIONS Allow-Headers includes `X-Forge-Dev-Principal` (DEF-S8-021 closed)
