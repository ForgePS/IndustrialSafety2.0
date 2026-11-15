# Subscriptions and Entitlements

**Sprint:** 1D  
**Related ADRs:** [ADR-017](../decisions/ADR-017-feature-flags-vs-entitlements.md), [ADR-019](../decisions/ADR-019-tenant-subscription-shutdown.md)

## Separation

| Mechanism         | Owner                 | Purpose                               |
| ----------------- | --------------------- | ------------------------------------- |
| **Entitlements**  | Commercial / billing  | Paid right to use a product or module |
| **Feature flags** | Engineering / product | Kill-switches and gradual rollout     |
| **Subscription**  | Commercial            | Plan lifecycle for a tenant           |

Flags must not grant unpaid access. Product gates require entitlement; flags may further restrict ([ADR-017](../decisions/ADR-017-feature-flags-vs-entitlements.md)).

## Catalog

Seeded platform products and modules:

| Product            | Modules (examples)       |
| ------------------ | ------------------------ |
| `FORGE_ACADEMY`    | `CORE`, `ADMINISTRATION` |
| `FORGE_RMS`        | `CORE`, `PERSONNEL`      |
| `FORGE_INDUSTRIAL` | `CORE`                   |
| `FORGE_CREATOR`    | `CORE`, `TENANT_ADMIN`   |

Read catalog: `GET /api/v1/platform/products`, `GET /api/v1/platform/modules`.

## Tenant entitlements

Under `api/v1/tenants/:tenantId`:

| Method | Path                               | Action                           |
| ------ | ---------------------------------- | -------------------------------- |
| GET    | `/entitlements`                    | List effective entitlements      |
| PUT    | `/products/:productCode`           | Grant/update product entitlement |
| PUT    | `/modules/:moduleCode/entitlement` | Grant/update module entitlement  |
| POST   | `/modules/:moduleCode/suspend`     | Suspend module                   |
| POST   | `/modules/:moduleCode/activate`    | Reactivate module                |

Principal loads `activeProducts` / `activeModules` sets for authorization checks.

## Subscriptions

Under `api/v1/tenants/:tenantId/subscriptions`:

- Create, list, get current
- Patch status/plan metadata
- Suspend / reactivate

Suspension or expiry **denies product/domain APIs** while allowing limited auth for status and billing ([ADR-019](../decisions/ADR-019-tenant-subscription-shutdown.md)). Data is retained; deletion follows separate offboarding policy.

`evaluateTenantOperationalState` in `@forge/authorization` derives `canAuthenticate`, `canUseProducts`, and `canManageBilling` from tenant + subscription status.

## Feature flags

Separate from entitlements:

| Method     | Path                                             |
| ---------- | ------------------------------------------------ |
| GET        | `/api/v1/platform/features`                      |
| GET        | `/api/v1/tenants/:tenantId/features/effective`   |
| PUT/DELETE | `/api/v1/tenants/:tenantId/features/:featureKey` |

## Configuration Studio (foundation)

Versioned tenant configuration and branding APIs exist as the Configuration Studio foundation (Phase 8):

- `GET/PUT` `/api/v1/tenants/:tenantId/configuration`…
- `GET/PUT` `/api/v1/tenants/:tenantId/branding`

Full studio UX, schema inheritance, and publish workflows remain product work beyond Sprint 1D.
