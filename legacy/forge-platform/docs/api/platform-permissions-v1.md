# Platform Permissions v1

**Sprint:** 1E  
**Source:** `@forge/contracts` `PLATFORM_PERMISSIONS`  
**Related:** [authorization.md](../architecture/authorization.md), [ADR-015](../decisions/ADR-015-permission-based-authorization.md)

## Principle

Authorize on **permission codes**, not role display names or Cognito groups. Roles are bundles of codes assigned through membership or legacy user role assignments. Effective access is the union of allows from active roles, then explicit denies; **deny wins**.

Amazon Cognito groups may exist for pool administration but are **not** the platform authorization system.

## Permission catalog

| Code                            | Typical use                                 |
| ------------------------------- | ------------------------------------------- |
| `platform.tenant.read`          | List and read tenants                       |
| `platform.tenant.create`        | Create tenants (creator-only)               |
| `platform.tenant.update`        | Update and lifecycle tenants                |
| `platform.tenant.suspend`       | Suspend tenants (creator-only)              |
| `platform.organization.read`    | Read organizations                          |
| `platform.organization.create`  | Create and update organizations             |
| `platform.person.read`          | Read persons                                |
| `platform.person.create`        | Create persons                              |
| `platform.person.update`        | Update and archive persons                  |
| `platform.person.merge`         | Merge person records                        |
| `platform.user.invite`          | Invite and manage users                     |
| `platform.role.assign`          | Roles and role assignments                  |
| `platform.permission.read`      | List permissions; authorization check       |
| `platform.audit.read`           | Audit events                                |
| `platform.feature.manage`       | Feature flags                               |
| `platform.entitlement.manage`   | Products, modules, subscriptions            |
| `platform.configuration.update` | Configuration and branding                  |
| `platform.sensitive_data.read`  | Reveal sensitive identifiers                |
| `platform.invitation.read`      | List and read invitations                   |
| `platform.invitation.manage`    | Create, resend, revoke invitations          |
| `platform.membership.read`      | Read memberships                            |
| `platform.membership.manage`    | Membership CRUD and lifecycle               |
| `platform.onboarding.manage`    | Customer onboarding sessions (creator-only) |

## Creator-only permissions

These may only be held or granted by platform (creator) principals (`CREATOR_ONLY_PERMISSIONS`):

- `platform.tenant.create`
- `platform.tenant.suspend`
- `platform.onboarding.manage`

Tenant administrators cannot grant creator-only codes even if they hold other permissions.

## Platform admin detection

A principal is treated as platform admin when either:

- They hold the `PLATFORM_SUPER_ADMIN` role code, or
- They simultaneously hold `platform.tenant.create`, `platform.tenant.suspend`, and `platform.entitlement.manage`

Platform admins may bypass some tenant operational blocks when `@RequirePermission(..., { allowWhenSuspended: true })` is set, but tenant RLS context still applies to tenant-scoped data.

## Membership-scoped grants

Sprint 1E introduces membership as the authoritative access aggregate ([ADR-021](../decisions/ADR-021-tenant-membership-model.md)):

- **Roles:** `membership_role_assignments` (preferred) or legacy `user_role_assignments`
- **Products/modules:** `membership_product_access` and `membership_module_access`, intersected with tenant entitlements

Only `ACTIVE` membership status grants access. `SUSPENDED`, `REVOKED`, and other non-active statuses block authentication to the tenant (except platform admin).

## Entitlements vs permissions

| Mechanism                        | Purpose                                                                                |
| -------------------------------- | -------------------------------------------------------------------------------------- |
| Permission codes                 | API handler authorization (`@RequirePermission`)                                       |
| Product/module entitlements      | What the tenant purchased and what modules are enabled                                 |
| Membership product/module access | What this user may use within entitled products                                        |
| Feature flags                    | Operational toggles ([ADR-017](../decisions/ADR-017-feature-flags-vs-entitlements.md)) |

A user may hold `platform.person.read` but still be blocked if the tenant subscription is read-only or the module is suspended.

## Evaluation order

`evaluateAuthorization` in `@forge/authorization`:

1. Tenant match (or platform admin)
2. Tenant/subscription operational state unless `allowWhenSuspended`
3. Optional product/module entitlement on the handler
4. Permission on `ForgePrincipal.permissions`
5. Explicit DENY role effects (organization-scoped when applicable)

Programmatic check: `POST /api/v1/authorization/check` with body describing the requested action.

## Seeded role templates

From `packages/database/src/seed.ts`:

| Template               | Type     | Intent                         |
| ---------------------- | -------- | ------------------------------ |
| `PLATFORM_SUPER_ADMIN` | PLATFORM | Full platform permission set   |
| `CREATOR_ADMIN`        | PLATFORM | Creator console administration |
| `TENANT_ADMIN`         | TENANT   | Tenant administration          |
| Additional templates   | TENANT   | Narrower operational roles     |

Starter onboarding templates (`INDUSTRIAL_STARTER`, `RMS_STARTER`, `ACADEMY_STARTER`) define tenant role codes and permission sets in `@forge/contracts` `starter-templates.ts`.

## API surface

| Method | Path                                                                     | Permission                 |
| ------ | ------------------------------------------------------------------------ | -------------------------- |
| GET    | `/api/v1/tenants/:tenantId/permissions`                                  | `platform.permission.read` |
| POST   | `/api/v1/tenants/:tenantId/roles`                                        | `platform.role.assign`     |
| GET    | `/api/v1/tenants/:tenantId/roles`                                        | `platform.permission.read` |
| GET    | `/api/v1/tenants/:tenantId/roles/:roleId`                                | `platform.permission.read` |
| PATCH  | `/api/v1/tenants/:tenantId/roles/:roleId`                                | `platform.role.assign`     |
| PUT    | `/api/v1/tenants/:tenantId/roles/:roleId/permissions`                    | `platform.role.assign`     |
| POST   | `/api/v1/tenants/:tenantId/users/:userId/role-assignments`               | `platform.role.assign`     |
| DELETE | `/api/v1/tenants/:tenantId/users/:userId/role-assignments/:assignmentId` | `platform.role.assign`     |
| POST   | `/api/v1/authorization/check`                                            | `platform.permission.read` |

Membership role assignment replaces per-user assignments for new integrations:

| Method  | Path                                                        | Permission    |
| ------- | ----------------------------------------------------------- | ------------- |
| GET/PUT | `/api/v1/tenants/:tenantId/memberships/:membershipId/roles` | read / manage |
