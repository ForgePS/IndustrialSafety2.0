# Authorization

**Sprint:** 1D  
**Related ADRs:** [ADR-015](../decisions/ADR-015-permission-based-authorization.md), [ADR-017](../decisions/ADR-017-feature-flags-vs-entitlements.md), [ADR-019](../decisions/ADR-019-tenant-subscription-shutdown.md)

## Principle

**Authorize on permission codes, not role names** ([ADR-015](../decisions/ADR-015-permission-based-authorization.md)).

- Roles are bundles of permission codes (e.g. `platform.person.read`).
- Handlers and guards check codes only.
- Effective access = union of allows from assigned roles, then apply explicit denies; **deny wins**.
- Missing permission is deny.

## Catalog and templates

Seeded from `@forge/contracts` `PLATFORM_PERMISSIONS` and role templates in `packages/database/src/seed.ts`:

| Template               | Type     | Intent                         |
| ---------------------- | -------- | ------------------------------ |
| `PLATFORM_SUPER_ADMIN` | PLATFORM | Full platform permission set   |
| `CREATOR_ADMIN`        | PLATFORM | Creator console administration |
| `TENANT_ADMIN`         | TENANT   | Tenant administration          |
| Additional templates   | TENANT   | Narrower operational roles     |

Tenant roles are created/cloned under `api/v1/tenants/:tenantId/roles` and mapped to permissions. Role display names may change; codes must not.

## Evaluation

`evaluateAuthorization` in `@forge/authorization` checks, in order:

1. Tenant match (or platform admin)
2. Tenant/subscription operational state (`canUseProducts`) unless `allowWhenSuspended` ([ADR-019](../decisions/ADR-019-tenant-subscription-shutdown.md))
3. Optional product/module entitlement ([ADR-017](../decisions/ADR-017-feature-flags-vs-entitlements.md))
4. Permission presence on principal
5. Explicit DENY role effects (org-scoped when applicable)

API edge: `@RequirePermission('platform....')` + `PermissionGuard`. Programmatic check: `POST /api/v1/authorization/check`.

## Request principal

`ForgePrincipal.permissions` is a `ReadonlySet<string>` loaded with the auth context. Platform admins short-circuit allows but still honor explicit deny and should not skip tenant RLS context for tenant data.

## Decision logging

Sensitive authorization decisions can be recorded in `authorization_decision_log` (tenant-scoped, RLS). Prefer logging denials and high-risk allows for audit correlation (see [audit-logging.md](../security/audit-logging.md)).

## API summary

| Method         | Path                                                        |
| -------------- | ----------------------------------------------------------- |
| GET            | `/api/v1/tenants/:tenantId/permissions`                     |
| POST/GET/PATCH | `/api/v1/tenants/:tenantId/roles`…                          |
| PUT            | `/api/v1/tenants/:tenantId/roles/:roleId/permissions`       |
| POST/DELETE    | `/api/v1/tenants/:tenantId/users/:userId/role-assignments`… |
| POST           | `/api/v1/authorization/check`                               |
