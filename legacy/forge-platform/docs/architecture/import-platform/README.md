# Universal Import Platform — Architecture Package

**Status:** ARCHITECTURE_PACKAGE_COMPLETE (skeleton delivery)  
**Date:** 2026-07-28  
**Review gate:** Architecture package ready for review before product-specific importers

| Document                                                             | Description                                |
| -------------------------------------------------------------------- | ------------------------------------------ |
| [IMPORT_PLATFORM_ARCHITECTURE.md](./IMPORT_PLATFORM_ARCHITECTURE.md) | System context and shared-engine principle |
| [IMPORT_WORKFLOW.md](./IMPORT_WORKFLOW.md)                           | Pipeline stages and job status machine     |
| [IMPORT_DATA_MODEL.md](./IMPORT_DATA_MODEL.md)                       | Entities and relationships                 |
| [IMPORT_DATABASE_SCHEMA.md](./IMPORT_DATABASE_SCHEMA.md)             | Schema + RLS notes                         |
| [IMPORT_API_SPECIFICATION.md](./IMPORT_API_SPECIFICATION.md)         | REST contracts                             |
| [IMPORT_SECURITY_MODEL.md](./IMPORT_SECURITY_MODEL.md)               | Security controls                          |
| [IMPORT_QUEUE_ARCHITECTURE.md](./IMPORT_QUEUE_ARCHITECTURE.md)       | S3 / SQS / Step Functions / worker         |
| [IMPORT_UI_SPECIFICATION.md](./IMPORT_UI_SPECIFICATION.md)           | Import Center UX                           |
| [IMPORT_TEST_STRATEGY.md](./IMPORT_TEST_STRATEGY.md)                 | Test matrix                                |
| [IMPORT_DEFINITION_OF_DONE.md](./IMPORT_DEFINITION_OF_DONE.md)       | DoD gates                                  |
| [IMPORT_IMPLEMENTATION_PLAN.md](./IMPORT_IMPLEMENTATION_PLAN.md)     | Sprint breakdown                           |

**Package skeleton:** `@forge/imports` (`packages/imports`)  
**Draft migration:** `packages/database/drizzle/0022_import_platform.sql`

## Consumes (do not duplicate)

- Configuration Platform published config via studio effective APIs (`import_config`, `dropdowns`, `custom_fields`, `terminology`, `forms`, `workflows`, `roles`, `permissions`, `branding`)
- Existing infra: imports SQS+DLQ (`forge-queues.ts`), imports S3 (`forge-buckets.ts`), ECS env `SQS_IMPORT_QUEUE_URL` / `S3_IMPORT_BUCKET`

## Explicit non-goals of this package

- Academy / RMS / Industrial product importers
- Configuration Platform redesign
- Full worker / Step Functions runtime wiring
- Malware scanner vendor integration beyond architecture hooks

Do **not** begin Academy / RMS / Industrial-specific importers until architecture review approval. Implementation sprint progress is tracked separately under `docs/sprints/IMPORT-PLATFORM-S*.md`.
