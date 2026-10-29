# Sprint 1D Summary — Platform Core Foundation

**Date completed:** 2026-07-25  
**Status:** COMPLETE (code, local tests, AWS migrate/seed/deploy verified)  
**Account / region:** `511343547817` / `us-east-1`  
**Cost profile:** Developer (worker desired count remains 0)

## Delivered

### Packages

- New: `@forge/errors`, `@forge/tenant-context`, `@forge/contracts`
- Implemented: `@forge/auth` (Cognito JWKS), `@forge/authorization`, `@forge/audit`, `@forge/events`
- Expanded: `@forge/database` (full Sprint 1D schema, RLS, seeds, UUIDv7, `withTenantTransaction`)

### ADRs

ADR-012 through ADR-019 (tenant isolation, person/user/identity, RLS, permissions, outbox, flags vs entitlements, sensitive data, subscription shutdown).

### Database

Migrations applied to local Postgres and development Aurora:

- `0000_foundation` (superseded)
- `0001_sprint_1d_platform_core` (tables, extensions, FORCE RLS)
- `0002_app_role_rls` (`forge_app` non-superuser role)

Idempotent seed: products, modules, permissions, role templates, org types, feature definitions.

### platform-api modules

`auth-context`, `tenants`, `organizations`, `persons`, `users`, `authorization`, `products`, `entitlements`, `subscriptions`, `feature-flags`, `configuration`, `branding`, `audit`, `outbox` under `/api/v1`.

Dev principal header `x-forge-dev-principal` for local/development only.

### Worker

Outbox publisher (SKIP LOCKED → EventBridge). Desired count remains 0; enable for integration testing.

### Creator Console

Minimal real-API screens: tenants, orgs, persons, users, roles, entitlements, features, configuration, audit.

### Bootstrap

`pnpm platform:bootstrap-admin --cognito-sub ... --email ... --first-name ... --last-name ...`

## Tests (exact)

| Suite                                              | Result   |
| -------------------------------------------------- | -------- |
| `@forge/authorization` unit                        | 4 passed |
| `@forge/audit` unit                                | 2 passed |
| `@forge/events` unit                               | 2 passed |
| `@forge/platform-api` unit                         | 9 passed |
| Tenant isolation integration (RLS via `forge_app`) | 1 passed |
| Local migrate + seed                               | OK       |
| Aurora migrate (ECS one-off)                       | exit 0   |
| Aurora seed (ECS one-off)                          | exit 0   |
| `pnpm smoke:development` `/health`                 | OK       |
| `/ready` database                                  | true     |
| Unauthenticated `/api/v1/platform/products`        | 401      |

## Deployment

- `pnpm infra:deploy` — ForgeCompute updated (task definition `:3`)
- Migrate: `node /app/packages/database/dist/migrate-ecs.js` via Fargate one-off
- Seed: `node /app/packages/database/dist/seed.js` via Fargate one-off
- ALB: `forge-development-alb-api-1005626432.us-east-1.elb.amazonaws.com`

## Known limitations / deferred

- Idempotency-Key persistence not fully wired
- If-Match optimistic concurrency not fully wired
- Full E2E scenarios A–E (Cognito invite accept, worker publish proof) not automated in CI
- Membership CRUD module not exposed as dedicated routes
- Payment processor not integrated
- Academy/RMS product modules out of scope

## Cost impact vs Sprint 1C

No structural cost increase in steady state (worker remains at 0; Aurora still auto-pause). Brief Fargate one-off tasks for migrate/seed only.

## Recommendation for Sprint 1E

Harden auth invitation acceptance against Cognito, complete Idempotency-Key + concurrency, automate E2E isolation/subscription scenarios in CI, enable worker desired count 1 in a scheduled integration window, and begin Phase 9 Document Engine or deepen Configuration Studio UX.
