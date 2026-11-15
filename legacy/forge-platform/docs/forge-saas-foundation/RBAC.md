# RBAC / Permissions — FORGE-SAAS-CORE

**Sprint:** MK-S4  
**ADR:** [ADR-015](../decisions/ADR-015-permission-based-authorization.md)

## Principle

Authorize on **permission codes**, never role display names. Deny wins over allow.

## Registries

| Layer              | Location                                                                                |
| ------------------ | --------------------------------------------------------------------------------------- |
| Permission catalog | `@forge/contracts` `PLATFORM_PERMISSIONS` / `ALL_PERMISSIONS`; DB `permissions`         |
| Role templates     | DB `role_templates` + `role_template_permissions` (seeded)                              |
| Tenant roles       | DB `roles` + `role_permissions` (`effect` ALLOW \| DENY)                                |
| Membership → role  | `membership_role_assignments` (primary); legacy `user_role_assignments`                 |
| Evaluation         | `@forge/authorization` `evaluateAuthorization` + `resolveEffectivePermissionCodes`      |
| API service        | `AuthorizationService` (list/create/patch roles, set permissions, assign/revoke, check) |
| Server guard       | `PermissionGuard` + `@RequirePermission` / `@RequireAnyPermission`                      |
| UI helpers         | `usePermission` / `useAnyPermission` / `useAllPermissions`; `<Can allowed={...}>`       |

## SaaS personas → Forge templates

| Persona | Template code    | Typical access                                      |
| ------- | ---------------- | --------------------------------------------------- |
| owner   | `TENANT_OWNER`   | Full tenant SaaS admin (parity with admin in MK-S4) |
| admin   | `TENANT_ADMIN`   | Same core SaaS admin bundle                         |
| member  | `STANDARD_USER`  | Org/person/permission read                          |
| viewer  | `READ_ONLY_USER` | Member reads + `platform.audit.read`                |

Helpers: `resolveSaasRolePersona`, `roleTemplateCodeForSaasPersona`, `saasPersonaHasPermission` in `@forge/contracts`.

## Custom roles (architecture)

- `AuthorizationService.createRole` inserts tenant roles with `isSystemManaged: false`.
- Permission sets via `setRolePermissions` (ALLOW rows today).
- Assign to memberships via membership role APIs / `assignRole`.
- **System-managed roles cannot be patched or have permissions replaced** (MK-S4).
- Full custom-role admin UI is deferred (BACKLOG).

## Core SaaS surfaces (MK-S4)

Permission-gated modules already use `@RequirePermission` for tenants, orgs, persons, users, memberships, invitations, authorization, facilities, branding, configuration, entitlements, onboarding.

Remaining product modules (RMS, Industrial, Import deep surfaces, etc.) are **not** bulk-rewritten here — see BACKLOG-011.

## Client vs server

UI capability helpers hide controls only. Server evaluation is authoritative.
