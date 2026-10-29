# Sprint 1D — Local Testing Guide

**Sprint:** 1D  
**See also:** [platform-bootstrap.md](./platform-bootstrap.md), [local-database.md](./local-database.md), [outbox-worker.md](../operations/outbox-worker.md)

## Prerequisites

1. Node + pnpm workspace install (`pnpm install`).
2. Docker for Postgres: `pnpm db:up`.
3. Migrate: `pnpm --filter @forge/database db:migrate` (applies `0000` + `0001_sprint_1d_platform_core`).
4. Seed catalog: `pnpm --filter @forge/database db:seed`.
5. Env via `@forge/environment` local placeholders (see package defaults / `.env` patterns).

## Run services

```bash
# API
pnpm --filter @forge/platform-api dev

# Outbox → EventBridge (optional for API-only unit work)
pnpm --filter @forge/worker-service dev

# Creator console
pnpm --filter @forge/creator-console dev
```

- Health: `GET http://localhost:<api-port>/health`
- Ready: `GET http://localhost:<api-port>/ready` (expects database)
- Console: set `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_DEV_PRINCIPAL`

## Dev authentication

When `APP_ENV` is `local`, `development`, or `testing`, omit Bearer and send:

```http
x-forge-dev-principal: {"userId":"<uuid>","tenantId":"<uuid>"}
```

Create/use a seeded or manually inserted user with `PLATFORM_SUPER_ADMIN` (or `CREATOR_ADMIN`) role assignment for console flows. Production Cognito Bearer remains the non-local path.

## Suggested smoke path

1. `POST /api/v1/platform/tenants` — create tenant
2. Activate tenant; create subscription / entitlements as needed
3. Create organization → person → user invitation
4. Assign role; `GET /api/v1/auth/me`
5. `POST /api/v1/authorization/check`
6. Write configuration/branding; list audit events
7. Confirm `outbox_events` rows; run worker and verify publish (EventBridge or local failure/retry behavior)

## Automated tests (exist in repo)

| Area                           | Path                                                                                                         |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| Tenant isolation (integration) | `packages/database/src/tenant-isolation.integration.test.ts`                                                 |
| Authorization evaluate         | `apps/platform-api/src/modules/authorization/authorization.evaluate.test.ts`                                 |
| Tenants service                | `apps/platform-api/src/modules/tenants/tenants.service.test.ts`                                              |
| Health                         | `apps/platform-api/src/health.test.ts`                                                                       |
| Packages                       | `authorization`, `audit`, `events`, `tenant-context`, `errors`, `security`, `observability`, `validation`, … |
| Worker                         | `apps/worker-service/src/job.test.ts`                                                                        |

Run package/app filters as needed, e.g.:

```bash
pnpm --filter @forge/authorization test
pnpm --filter @forge/platform-api test
pnpm --filter @forge/database test
```

Integration tests need Postgres up and migrated.

## Sensitive data locally

- Prefer `SENSITIVE_DATA_LOCAL_KEY` (base64 32-byte key).
- Or rely on the fixed local fallback (tests only).
- Force local crypto with `SENSITIVE_DATA_FORCE_LOCAL=1` when debugging against AWS-like env vars.

## AWS development note

Sprint 1C deployed the development AWS environment. **Sprint 1D migrate/deploy of schema and new API images against that environment may still be pending verification** — do not assume production-like AWS has `0001` applied until confirmed in the sprint summary.
