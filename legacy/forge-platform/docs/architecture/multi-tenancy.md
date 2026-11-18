# Multi-Tenancy

**Sprint:** 1D  
**Related ADRs:** [ADR-012](../decisions/ADR-012-shared-database-tenant-isolation.md), [ADR-014](../decisions/ADR-014-postgresql-rls-strategy.md), [ADR-019](../decisions/ADR-019-tenant-subscription-shutdown.md)

## Model

Forge uses a **shared database with logical tenant isolation** ([ADR-012](../decisions/ADR-012-shared-database-tenant-isolation.md)):

- One Aurora/PostgreSQL cluster and schema for all tenants.
- Tenant-owned rows include `tenant_id` (UUID).
- No per-tenant stacks, clusters, or databases for standard tenancy.

## Tenant lifecycle

Managed via `api/v1/platform/tenants`:

| Status path | Meaning                                                                                                                     |
| ----------- | --------------------------------------------------------------------------------------------------------------------------- |
| Create      | Provision tenant record + related bootstrap data                                                                            |
| Activate    | Tenant becomes operationally usable                                                                                         |
| Suspend     | Product APIs denied; auth may continue for status/billing ([ADR-019](../decisions/ADR-019-tenant-subscription-shutdown.md)) |
| Archive     | Soft end-of-life; data retained pending retention policy                                                                    |

Supporting tenant resources: domains, settings, branding, organizations, persons, users, roles, subscriptions, entitlements, configuration, audit.

## Isolation layers

1. **Application** — Principal must match path `tenantId` (unless platform admin); services always filter by tenant.
2. **Database RLS** — `FORCE ROW LEVEL SECURITY` with predicate `tenant_id = current_setting('app.current_tenant_id')::uuid` ([ADR-014](../decisions/ADR-014-postgresql-rls-strategy.md)).
3. **Missing context denies** — Empty/invalid GUC yields no rows and blocks writes (`WITH CHECK`).
4. **Transaction locality** — Use `SET LOCAL` / `set_config(..., true)` so context ends with the transaction (`withTenantTransaction` in `@forge/database`).

Tables covered by standard tenant RLS are listed in `packages/database/src/rls.sql.ts` (`TENANT_RLS_TABLES`). Platform catalog tables (products, permissions, role templates, etc.) are not tenant-scoped.

## Request flow

```
HTTP → AuthGuard → TenantGuard → PermissionGuard
     → withTenantTransaction(tenantId, userId)
     → domain service (+ outbox + audit)
```

Local/dev bypass: `x-forge-dev-principal` when `APP_ENV` is `local` | `development` | `testing` (see [platform-bootstrap.md](../development/platform-bootstrap.md)).

## Platform vs tenant scope

| Scope    | Examples                                                           |
| -------- | ------------------------------------------------------------------ |
| Platform | Tenant CRUD, product/module catalog, global feature definitions    |
| Tenant   | Orgs, persons, users, roles, entitlements, config, branding, audit |

Platform admins (`isPlatformAdmin`) may operate across tenants; still use explicit tenant context for tenant-owned writes.

## Security doc

Operational controls and test expectations: [tenant-isolation.md](../security/tenant-isolation.md).
