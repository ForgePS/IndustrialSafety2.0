# Import Platform — Sprint S2 Summary

**Date:** 2026-07-28  
**Status:** **ACCEPTED**  
**Do not start S3.**

## Objectives

Build the secure NestJS API control plane for Universal Import: jobs, profiles, mappings, lifecycle, permissions, RLS, idempotency, audit/outbox, OpenAPI, and tests — without file processing.

## S1 precondition

**ACCEPTED** — migration 0022, FORCE RLS, 12 permissions, live RLS `ok: true`, app role no bypass, secret integrity.

## Completed work

- Nest module `apps/platform-api/src/modules/imports/*`
- Shared DTOs/state machine/templates/errors in `@forge/imports`
- Drizzle schema `imports.ts` + migration `0023` control-plane columns
- ForgeError IMPORT_* codes; domain events for S2 audit actions
- OpenAPI `docs/api/import-openapi.yaml`; architecture/API/authz/ADR docs
- Unit + e2e tests (local PASS)

## API routes added

All under `/api/v1/imports`: jobs CRUD/lifecycle/mappings; profiles CRUD/archive/restore; templates metadata.

## Database changes

Additive migration `0023_import_platform_s2_control_plane.sql`: `display_name`, `description`, `source_type`, `requested_mode` on `import_jobs`.

## Permissions enforced

`import.view|upload|map|validate|preview|approve|profile.manage` on routes (see authz report).

## Audit / outbox events

Job/profile/mapping lifecycle events via `OutboxService` + `AuditService` (ImportJobCreated/Updated/Cancelled, ImportMappingsUpdated, ImportValidationRequested, ImportPreviewRequested, ImportSubmittedForApproval, ImportApproved/Rejected, ImportProfile*).

## Tests (local)

| Suite              | Passed | Failed | Skipped |
| ------------------ | ------ | ------ | ------- |
| imports unit       | 14     | 0      | 0       |
| errors/events unit | 4      | 0      | 0       |
| imports e2e        | 1      | 0      | 0       |
| typecheck          | PASS   |        |         |

## Known limitations

1. Validation/preview = `NOT_AVAILABLE_UNTIL_S3`
2. No upload/parse/worker/execute/rollback/adapters

## Deployment

| Item         | Value                                           |
| ------------ | ----------------------------------------------- |
| Image        | `import-s2-20260729072334` / `sha256:017657bc…` |
| API TD       | `:33` (rollback `:32`)                          |
| Worker       | `:19`                                           |
| Migrate 0023 | exit **0**                                      |
| Health       | 200                                             |

## Recommendation for S3

S2 foundation is live. Authorize S3 (presigned upload + storage + scan orchestration) only with an **explicit** kickoff. Do not auto-start.
