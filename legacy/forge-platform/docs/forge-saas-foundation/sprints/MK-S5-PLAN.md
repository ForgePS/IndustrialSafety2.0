# MK-S5 Plan — Products / Modules / Entitlements

## Objective

Centralize the product/module entitlement system so permission alone cannot unlock paid capabilities. Catalog helpers, session/UI filters, and server entitlement checks must agree.

## Current State

- Catalog: `platform_products` / `platform_modules`; tenant grants: `tenant_products` / `tenant_module_entitlements`.
- Membership grants intersect tenant entitlements in `AuthContextService.loadEntitlements`.
- `evaluateAuthorization` supports `requiresEntitlement` but almost no controllers pass it.
- `@forge/web-kit` already imports `isProductEnabled` / `getEntitlements` from `@forge/contracts`, but those exports are missing (broken contract).
- Nav filtering exists (`filterNavigationForSession` / design-system).

## Reuse

- ADR-017 (flags ≠ entitlements), ADR-019 (subscription ops), ADR-021 (membership grants)
- `EntitlementsService` / Products catalog APIs
- PermissionGuard `requiresEntitlement` option
- Principal `activeProducts` / `activeModules`

## Changes Required

1. `@forge/contracts` `entitlement-domain.ts`: catalog codes, `getEntitlements`, `isProductEnabled`, `isModuleEnabled`, `getTenantProducts` / `getTenantModules`.
2. `@forge/authorization` `requireEntitlement` helper + persona-style entitlement matrix tests.
3. HARDEN `loadEntitlements` to respect module `startsAt` / `endsAt` windows.
4. Wire `requiresEntitlement: { productCode: "FORGE_INDUSTRIAL" }` on facilities controller (representative product surface — user choice).
5. Export web-kit entitlement helpers + `useProductEnabled` / `useModuleEnabled`.
6. `ENTITLEMENTS.md`; backlog seats/plan auto-grant / module-code uniqueness if needed.

## Files Expected

```text
docs/forge-saas-foundation/sprints/MK-S5-PLAN.md
docs/forge-saas-foundation/sprints/MK-S5-COMPLETE.md
docs/forge-saas-foundation/ENTITLEMENTS.md
packages/contracts/src/entitlement-domain.ts (+ tests)
packages/authorization/src/index.ts (+ tests)
apps/platform-api/.../auth-context.service.ts
apps/platform-api/.../facilities.controller.ts
packages/web-kit/src/auth-provider.tsx | entitlements exports
```

## Database Changes

None.

## Security Impact

- Facilities APIs deny without industrial product entitlement (permission alone insufficient)
- Expired/future-dated module entitlements no longer appear active in principal

## Tests Required

- permission + entitlement = allow
- permission + no entitlement = deny
- entitlement + no permission = deny
- cross-tenant entitlement denied (via evaluateAuthorization TENANT_MISMATCH)
- nav hides unentitled modules
- expired module window excluded from active set (unit of resolve helper)

## Out of Scope

- Stripe/plan auto-grant (MK-S9)
- Seat/quantityLimit enforcement (BACKLOG)
- Bulk rewrite of all product controllers
- MK-S6+

## Risks

- Facilities now gated to industrial product; non-industrial tenants using facilities API need that product granted (aligns with MK-S1 industrial facilities use).
- Module codes are not globally unique across products (`CORE`); product gate preferred for facilities.
