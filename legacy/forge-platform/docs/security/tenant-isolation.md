# Tenant Isolation Controls

**Sprint:** 1D  
**Related ADRs:** [ADR-012](../decisions/ADR-012-shared-database-tenant-isolation.md), [ADR-014](../decisions/ADR-014-postgresql-rls-strategy.md)

## Threat model (summary)

On a shared database, a bug that omits `WHERE tenant_id = …` can leak rows across tenants. Forge treats isolation as defense in depth: application checks **plus** PostgreSQL RLS ([ADR-012](../decisions/ADR-012-shared-database-tenant-isolation.md), [ADR-014](../decisions/ADR-014-postgresql-rls-strategy.md)).

## Controls

| Layer        | Control                                                                     |
| ------------ | --------------------------------------------------------------------------- |
| Auth         | Cognito JWT or restricted local-only dev principal                          |
| Tenant guard | Path `tenantId` must match principal (except platform admin)                |
| Authz        | Permission + entitlement + subscription state                               |
| DB session   | `app.current_tenant_id` / `app.current_user_id` via `withTenantTransaction` |
| RLS          | `ENABLE` + `FORCE` on tenant-owned tables; missing GUC denies               |
| Audit        | Mutations write tenant-scoped audit events                                  |

## RLS policy shape

```sql
tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
```

Applied as both `USING` and `WITH CHECK`. Source of table list: `TENANT_RLS_TABLES` in `packages/database/src/rls.sql.ts` (organizations, persons, users, roles, entitlements, subscriptions, idempotency keys, etc.).

## Bypass rules

- Default API DB role must not have table owner bypass of RLS.
- Cross-tenant system jobs require an explicit, reviewed bypass path — never “RLS off” for the normal API role.
- Migrations/seed tools may use elevated connections; they are not request-path code.

## Verification

Integration coverage: `packages/database/src/tenant-isolation.integration.test.ts` (requires local Postgres).

Manual checks for any new tenant table:

1. Add `tenant_id` and include table in `TENANT_RLS_TABLES` / migration RLS block.
2. Access only through `withTenantTransaction`.
3. Confirm empty GUC returns zero rows.
4. Confirm cross-tenant principal cannot read/write another tenant’s ids.

## Dev principal caution

`x-forge-dev-principal` is **disabled** outside `local` / `development` / `testing`. Never enable equivalent bypasses in production images or shared staging without compensating controls.

## Related

- Architecture: [multi-tenancy.md](../architecture/multi-tenancy.md)
- Sensitive data: [sensitive-data.md](./sensitive-data.md)
- Audit: [audit-logging.md](./audit-logging.md)
