# MK-S4 Complete — RBAC / Permissions

**Program:** FORGE-SAAS-CORE  
**Sprint:** MK-S4  
**Completed:** 2026-08-10  
**Verdict:** PASS  
**Repair passes used:** 1 (rebuild `@forge/contracts` / `@forge/authorization` dist for consumers)

## Objective achieved

Centralized SaaS RBAC documentation and contracts; deny-wins effective permission resolution; `TENANT_OWNER` template; system-managed role immutability; persona authZ matrix tests; UI capability helpers.

## Scope completed

- `rbac-domain` SaaS personas → role templates (`owner`→`TENANT_OWNER`, etc.)
- Seed templates for owner/admin/member/viewer driven from contracts
- `resolveEffectivePermissionCodes` + `AuthContextService.loadPermissions` deny-wins
- Block `patchRole` / `setRolePermissions` on `isSystemManaged` roles
- web-kit / tenant-context capability helpers (`hasAny` / `hasAll` / hooks)
- Persona × action matrix + cross-tenant deny tests
- `RBAC.md`; BACKLOG-011 product migration; BACKLOG-012 custom-role UI

## Reused

- ADR-015; `@forge/authorization` evaluate; `PermissionGuard`; `AuthorizationService` custom roles API
- Core SaaS controllers already `@RequirePermission`-gated

## Extended

- Deny-wins across role union
- System role mutation guard
- SaaS persona vocabulary

## New

- `TENANT_OWNER` role template
- `packages/contracts/src/rbac-domain.ts`
- `docs/forge-saas-foundation/RBAC.md`

## Verification

| Check                                                                                 | Result    |
| ------------------------------------------------------------------------------------- | --------- |
| contracts unit                                                                        | 14 passed |
| authorization unit                                                                    | 35 passed |
| tenant-context unit                                                                   | 2 passed  |
| web-kit unit                                                                          | 16 passed |
| platform-api authz/auth-context unit                                                  | 22 passed |
| typecheck (contracts, authorization, tenant-context, web-kit, platform-api, database) | PASS      |
| Production operations                                                                 | NONE      |

## Next sprint

NOT AUTHORIZED.
