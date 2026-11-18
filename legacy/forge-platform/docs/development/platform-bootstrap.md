# Platform API bootstrap (Sprint 1D)

## Prerequisites

1. PostgreSQL with Sprint 1D migrations applied (`pnpm --filter @forge/database db:migrate`).
2. Seed catalog data (`pnpm --filter @forge/database db:seed`).
3. Environment loaded via `@forge/environment` (local placeholders are fine for unit work).

## Run the API

```bash
pnpm --filter @forge/platform-api dev
```

Health: `GET /health`  
Ready: `GET /ready`  
API prefix: `/api/v1`

## Auth

Production-like requests require `Authorization: Bearer <cognito-access-token>`.

### Dev principal bypass (local / development / testing only)

When `APP_ENV` is `local`, `development`, or `testing`, you may omit the Bearer token and send:

```http
x-forge-dev-principal: {"userId":"<uuid>","tenantId":"<uuid>"}
```

Aliases also accepted: `x-forge-dev-user`, `X-Forge-Dev-User`.

The API loads that user, resolves tenant access, roles, permissions, and entitlements into a `ForgePrincipal`. This path is **disabled** outside local-like environments.

Create a bootstrap platform admin user + `PLATFORM_SUPER_ADMIN` role assignment in the seed/tenant you use for Creator console work.

## Sensitive data (local)

`SENSITIVE_DATA_LOCAL_KEY` may be a base64-encoded 32-byte AES key. If unset, a fixed local-only key is used for tests. Outside local, KMS (`KMS_SENSITIVE_DATA_KEY_ARN`) is preferred with AES-GCM fallback when KMS is unavailable.

## Outbox

Domain mutations write `outbox_events` in-transaction. Run the worker to publish (see `docs/operations/outbox-worker.md`).
