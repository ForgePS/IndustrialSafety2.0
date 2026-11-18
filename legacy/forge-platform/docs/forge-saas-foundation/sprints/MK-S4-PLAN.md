# MK-S4 Plan — RBAC / Permissions

## Objective

Centralize authorization for core SaaS: registries, role↔permission and membership↔role mapping, authorization evaluation, server guards, and UI capability helpers. Architecture must support tenant custom roles (API already creates `isSystemManaged=false` roles; full custom-role UI deferred).

## Current State

- Permission catalog: `@forge/contracts` `PLATFORM_PERMISSIONS` / `ALL_PERMISSIONS`; seeded in `packages/database/src/seed.ts`.
- Roles: `roles`, `role_permissions`, `role_templates`; assignments via `membership_role_assignments` (primary) and legacy `user_role_assignments`.
- Evaluation: `@forge/authorization` `evaluateAuthorization` (tenant match, operational state, entitlement, permission, explicit deny).
- Guards: `AuthGuard` → `TenantGuard` → `PermissionGuard` + `@RequirePermission`.
- UI: `@forge/web-kit` `hasPermission` / `usePermission`; `@forge/ui` `Can`.
- Gap: DENY rows are skipped in `loadPermissions` instead of deny-wins over ALLOW.
- Gap: no SaaS owner/admin/member/viewer persona mapping; no `TENANT_OWNER` template.
- Gap: system-managed roles not blocked from permission mutation.

## Reuse

- ADR-015 permission-based authZ
- `AuthorizationService` role CRUD / assign / check
- Seed role templates + membership role assignment
- PermissionGuard + decorate path on core SaaS controllers (already present)

## Changes Required

1. `@forge/contracts` `rbac-domain.ts`: SaaS personas → role templates; owner/admin/member/viewer permission bundles; helpers.
2. Seed `TENANT_OWNER` role template; wire SaaS four templates from contracts where practical.
3. `resolveEffectivePermissionCodes` in `@forge/authorization`; use in `AuthContextService.loadPermissions` (deny wins).
4. Refuse `patchRole` / `setRolePermissions` on `isSystemManaged` roles.
5. web-kit: `useAnyPermission` / `useAllPermissions`.
6. AuthZ matrix unit tests for personas + cross-tenant deny + deny-wins.
7. `RBAC.md`; backlog remaining product-surface permission migration.

## Files Expected

```text
docs/forge-saas-foundation/sprints/MK-S4-PLAN.md
docs/forge-saas-foundation/sprints/MK-S4-COMPLETE.md
docs/forge-saas-foundation/RBAC.md
docs/forge-saas-foundation/BACKLOG.md (append migration item if needed)
packages/contracts/src/rbac-domain.ts (+ tests)
packages/contracts/src/index.ts
packages/authorization/src/index.ts (+ tests)
packages/database/src/seed.ts (TENANT_OWNER + shared bundles)
apps/platform-api/.../auth-context.service.ts
apps/platform-api/.../authorization.service.ts (+ tests)
packages/web-kit/src/auth-provider.tsx (+ tests)
```

## Database Changes

None required for schema. Seed/template catalog add: `TENANT_OWNER` (applied on seed runs only — no production ops this sprint).

## Security Impact

- Deny-wins across role union
- System role immutability
- Explicit persona expectation documentation for core SaaS checks

## Tests Required

- owner/admin allowed on representative manage actions
- member restricted on manage; allowed on read where granted
- viewer denied mutation
- other tenant denied
- DENY overrides ALLOW in effective permission resolution
- system-managed role mutation refused

## Out of Scope

- Full custom-role admin UI (MK backlog)
- Uncontrolled RMS/Industrial permission rewrite
- MK-S5+ (organizations / facilities product depth)
- Production mutations

## Risks

- Seed vs existing tenant roles: new template appears on fresh seed; existing tenants keep prior roles until onboard/bootstrap copies templates.
- Persona naming ≠ role display names: authorize on permission codes only.
