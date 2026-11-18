# Platform Core Architecture

**Sprint:** 1D  
**Related ADRs:** [ADR-012](../decisions/ADR-012-shared-database-tenant-isolation.md), [ADR-016](../decisions/ADR-016-outbox-pattern.md)

## Purpose

Platform core is the shared foundation every Forge product builds on: multi-tenant data model, identity links, authorization, entitlements, configuration, audit, and domain events. Product engines (Academy, RMS, Industrial) are deferred; this layer only provides platform APIs and Creator console administration.

## Runtime layout

| Component              | Role                                                                                                                                                           |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/platform-api`    | NestJS HTTP API (`/api/v1`, plus `/health` `/ready`)                                                                                                           |
| `apps/worker-service`  | Outbox poller → EventBridge publisher                                                                                                                          |
| `apps/creator-console` | Next.js admin UI for platform operators                                                                                                                        |
| `packages/database`    | Drizzle schema, migrations, RLS helpers, seed                                                                                                                  |
| Shared packages        | `contracts`, `auth`, `authorization`, `tenant-context`, `events`, `audit`, `errors`, `validation`, `security`, `configuration`, `observability`, `environment` |

## NestJS modules (Sprint 1D)

`auth-context`, `tenants`, `organizations`, `persons`, `users`, `authorization`, `products`, `entitlements`, `subscriptions`, `feature-flags`, `configuration`, `branding`, `audit`, `outbox`.

## Data foundation

- Migration `packages/database/drizzle/0001_sprint_1d_platform_core.sql` (after `0000_foundation.sql`).
- Shared Aurora/PostgreSQL database; tenant-owned rows carry `tenant_id` ([ADR-012](../decisions/ADR-012-shared-database-tenant-isolation.md)).
- Catalog tables (products, modules, permissions, role templates, org types, plans, feature definitions) are platform-global; tenant data is RLS-scoped ([ADR-014](../decisions/ADR-014-postgresql-rls-strategy.md)).
- Idempotent seed: `pnpm --filter @forge/database db:seed`.

## Cross-cutting behaviors

1. **Auth** — Cognito Bearer token (or local `x-forge-dev-principal`); resolves `ForgePrincipal` with permissions and entitlements.
2. **Tenant context** — `withTenantTransaction` sets `app.current_tenant_id` / `app.current_user_id` GUCs before queries.
3. **Authorization** — Permission codes via `@RequirePermission` / `PermissionGuard` ([ADR-015](../decisions/ADR-015-permission-based-authorization.md)).
4. **Mutations** — Domain write + outbox row + audit row in one transaction ([ADR-016](../decisions/ADR-016-outbox-pattern.md)).
5. **Commercial gates** — Subscription/entitlement checks at the API edge ([ADR-017](../decisions/ADR-017-feature-flags-vs-entitlements.md), [ADR-019](../decisions/ADR-019-tenant-subscription-shutdown.md)).

## API surface

See [platform-core-api.md](../api/platform-core-api.md). Health endpoints remain outside `/api/v1`.

## Explicit non-goals (1D)

- Academy/RMS/Industrial domain modules
- Firebase removal or data migration
- GovCloud partition deploy
- Production hardening beyond development baseline

## Further reading

- [multi-tenancy.md](./multi-tenancy.md)
- [person-user-identity.md](./person-user-identity.md)
- [authorization.md](./authorization.md)
- [domain-events.md](./domain-events.md)
- [subscriptions-entitlements.md](./subscriptions-entitlements.md)
- [platform-bootstrap.md](../development/platform-bootstrap.md)
