# Import Platform API Architecture (S2)

**Status:** IMPLEMENTED (S2 control plane)  
**Base path:** `/api/v1/imports`  
**Date:** 2026-07-28

## Purpose

Provide a product-neutral NestJS control plane for import jobs, profiles, mappings, and lifecycle orchestration without implementing file upload, parsing, workers, or product adapters.

## Module placement

- Nest module: `apps/platform-api/src/modules/imports/`
- Shared contracts/DTOs/state machine/templates: `packages/imports/`
- Drizzle tables: `packages/database/src/schema/imports.ts`
- Migrations: `0022_import_platform.sql`, `0023_import_platform_s2_control_plane.sql`

## Reused platform frameworks

| Concern       | Existing mechanism                                                  |
| ------------- | ------------------------------------------------------------------- |
| Auth          | `AuthGuard` + `x-forge-dev-principal` / Cognito                     |
| Permissions   | `@RequirePermission` / `@RequireAnyPermission` + `PermissionGuard`  |
| Tenant + RLS  | `withTenantTransaction` (`SET LOCAL app.current_tenant_id/user_id`) |
| Idempotency   | `@Idempotent` + `IdempotencyInterceptor` (ADR-022)                  |
| Audit         | `AuditService.writeInTransaction`                                   |
| Domain events | `OutboxService.write`                                               |
| Correlation   | `getRequestIds` / request middleware                                |
| Validation    | Zod schemas in `@forge/imports`                                     |
| Errors        | `ForgeError` + `GlobalExceptionFilter`                              |

## S2 initial job state

Jobs created without file upload start in **`READY_FOR_MAPPING`** (control-plane shell). Upload/scan states remain reserved for S3+.

## Validation / preview requests

Endpoints persist auditable orchestration events and return `requestStatus: NOT_AVAILABLE_UNTIL_S3`. They do **not** fake progress, row counts, or completion.

## Entitlements

Job/profile creation requires an ACTIVE tenant product + module entitlement for `productKey` / `moduleKey`.

## Out of scope (S2)

Presigned upload, S3, malware scan, CSV/XLSX/JSON/ZIP parsing, SQS workers, execution, rollback execution, product adapters.
