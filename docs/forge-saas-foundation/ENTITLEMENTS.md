# Products / Modules / Entitlements — FORGE-SAAS-CORE

**Sprint:** MK-S5  
**ADR:** [ADR-017](../decisions/ADR-017-feature-flags-vs-entitlements.md), [ADR-019](../decisions/ADR-019-tenant-subscription-shutdown.md)

## Principle

**Permission ≠ entitlement.** A principal needs both an active permission code and the relevant product/module entitlement. Feature flags must not grant unpaid access.

## Catalog

| Code               | Name                    |
| ------------------ | ----------------------- |
| `FORGE_ACADEMY`    | Forge Academy           |
| `FORGE_RMS`        | Forge RMS               |
| `FORGE_INDUSTRIAL` | Forge Industrial Safety |
| `FORGE_CREATOR`    | Forge Creator           |

Modules belong to products (`platform_modules.product_id`). Seeded via starter templates / seed.

Contracts helpers (`@forge/contracts`):

- `getEntitlements` / `getTenantProducts` / `getTenantModules`
- `isProductEnabled` / `isModuleEnabled`
- `isModuleEntitlementWithinWindow`
- `PLATFORM_PRODUCT_CATALOG`

Authorization (`@forge/authorization`):

- `evaluateAuthorization({ requiresEntitlement })`
- `requireEntitlement(principal, { productCode?, moduleCode? })`

## Resolution path

```text
membership product/module grants
        ∩
tenant_products (ACTIVE) / tenant_module_entitlements (ACTIVE|GRACE + time window)
        →
principal.activeProducts / activeModules
        →
PermissionGuard / evaluateAuthorization
```

## UI

- `filterNavigationForSession` hides nav without product/module (and permission).
- `useProductEnabled` / `useModuleEnabled` / `sessionProductEnabled` / `sessionModuleEnabled`.
- Client checks are UX only; server is authoritative.

## Representative server gate (MK-S5)

Facilities API requires industrial product entitlement in addition to `tenant.facilities.*` permissions:

```ts
@RequirePermission("tenant.facilities.read", {
  requiresEntitlement: { productCode: "FORGE_INDUSTRIAL" },
})
```

Remaining product controllers should adopt `requiresEntitlement` incrementally (BACKLOG).
