# Platform Core API (`/api/v1`)

**Sprint:** 1D (endpoint index)  
**Superseded for contract detail by:** [platform-contract-v1.md](./platform-contract-v1.md) (Sprint 1E frozen contract)  
**App:** `apps/platform-api`  
**Auth:** Bearer Cognito access token, or local `x-forge-dev-principal` (see [platform-bootstrap.md](../development/platform-bootstrap.md)).

Health endpoints (not under `/api/v1`): `GET /health`, `GET /ready`.

## Auth

| Method   | Path                                  | Notes                                  |
| -------- | ------------------------------------- | -------------------------------------- |
| GET      | `/api/v1/auth/me`                     | Current principal + selectable tenants |
| POST     | `/api/v1/auth/select-tenant`          | Switch tenant context                  |
| POST     | `/api/v1/auth/logout-all`             | Revoke all sessions                    |
| POST/GET | `/api/v1/auth/invitations`            | Create, list (Sprint 1E)               |
| POST     | `/api/v1/auth/invitations/accept`     | Accept user invitation                 |
| POST     | `/api/v1/auth/invitations/:id/resend` | Resend invitation                      |
| POST     | `/api/v1/auth/invitations/:id/revoke` | Revoke invitation                      |

## Memberships (Sprint 1E)

Base: `/api/v1/tenants/:tenantId/memberships` — CRUD, activate, suspend, revoke, roles, products, history. See [platform-contract-v1.md](./platform-contract-v1.md).

## Platform tenants

Base: `/api/v1/platform/tenants`

| Method | Path                  |
| ------ | --------------------- |
| POST   | `/`                   |
| GET    | `/`                   |
| GET    | `/:tenantId`          |
| PATCH  | `/:tenantId`          |
| POST   | `/:tenantId/activate` |
| POST   | `/:tenantId/suspend`  |
| POST   | `/:tenantId/archive`  |

## Platform catalog

Base: `/api/v1/platform`

| Method | Path        |
| ------ | ----------- |
| GET    | `/products` |
| GET    | `/modules`  |
| GET    | `/features` |

## Organizations

Base: `/api/v1/tenants/:tenantId/organizations`

| Method | Path                       |
| ------ | -------------------------- |
| POST   | `/`                        |
| GET    | `/`                        |
| GET    | `/:organizationId`         |
| PATCH  | `/:organizationId`         |
| POST   | `/:organizationId/archive` |

## Persons

Base: `/api/v1/tenants/:tenantId/persons`

| Method | Path                                     |
| ------ | ---------------------------------------- |
| POST   | `/`                                      |
| GET    | `/`                                      |
| POST   | `/merge`                                 |
| GET    | `/:personId`                             |
| PATCH  | `/:personId`                             |
| POST   | `/:personId/archive`                     |
| GET    | `/:personId/duplicate-candidates`        |
| POST   | `/:personId/sensitive-identifiers`       |
| GET    | `/:personId/sensitive-identifiers/:type` |

## Users

| Method | Path                                              |
| ------ | ------------------------------------------------- |
| POST   | `/api/v1/tenants/:tenantId/users/invitations`     |
| GET    | `/api/v1/tenants/:tenantId/users`                 |
| GET    | `/api/v1/tenants/:tenantId/users/:userId`         |
| PATCH  | `/api/v1/tenants/:tenantId/users/:userId`         |
| POST   | `/api/v1/tenants/:tenantId/users/:userId/disable` |
| POST   | `/api/v1/tenants/:tenantId/users/:userId/enable`  |

## Authorization

| Method | Path                                                                     |
| ------ | ------------------------------------------------------------------------ |
| GET    | `/api/v1/tenants/:tenantId/permissions`                                  |
| POST   | `/api/v1/tenants/:tenantId/roles`                                        |
| GET    | `/api/v1/tenants/:tenantId/roles`                                        |
| GET    | `/api/v1/tenants/:tenantId/roles/:roleId`                                |
| PATCH  | `/api/v1/tenants/:tenantId/roles/:roleId`                                |
| PUT    | `/api/v1/tenants/:tenantId/roles/:roleId/permissions`                    |
| POST   | `/api/v1/tenants/:tenantId/users/:userId/role-assignments`               |
| DELETE | `/api/v1/tenants/:tenantId/users/:userId/role-assignments/:assignmentId` |
| POST   | `/api/v1/authorization/check`                                            |

## Entitlements

Base: `/api/v1/tenants/:tenantId`

| Method | Path                               |
| ------ | ---------------------------------- |
| GET    | `/entitlements`                    |
| PUT    | `/products/:productCode`           |
| PUT    | `/modules/:moduleCode/entitlement` |
| POST   | `/modules/:moduleCode/suspend`     |
| POST   | `/modules/:moduleCode/activate`    |

## Subscriptions

Base: `/api/v1/tenants/:tenantId/subscriptions`

| Method | Path                          |
| ------ | ----------------------------- |
| POST   | `/`                           |
| GET    | `/`                           |
| GET    | `/current`                    |
| PATCH  | `/:subscriptionId`            |
| POST   | `/:subscriptionId/suspend`    |
| POST   | `/:subscriptionId/reactivate` |

## Feature flags

| Method | Path                                             |
| ------ | ------------------------------------------------ |
| GET    | `/api/v1/tenants/:tenantId/features/effective`   |
| PUT    | `/api/v1/tenants/:tenantId/features/:featureKey` |
| DELETE | `/api/v1/tenants/:tenantId/features/:featureKey` |

## Configuration and branding

| Method | Path                                                      |
| ------ | --------------------------------------------------------- |
| GET    | `/api/v1/tenants/:tenantId/configuration`                 |
| GET    | `/api/v1/tenants/:tenantId/configuration/:namespace`      |
| PUT    | `/api/v1/tenants/:tenantId/configuration/:namespace/:key` |
| GET    | `/api/v1/tenants/:tenantId/branding`                      |
| PUT    | `/api/v1/tenants/:tenantId/branding`                      |

## Audit

Base: `/api/v1/tenants/:tenantId/audit-events`

| Method | Path             |
| ------ | ---------------- |
| GET    | `/`              |
| GET    | `/:auditEventId` |
| POST   | `/export`        |

## Conventions

- Permission codes gate handlers (`@RequirePermission`); see [authorization.md](../architecture/authorization.md).
- Tenant path params are enforced against the principal and RLS session GUC.
- Successful mutations typically enqueue outbox + audit rows in-transaction.
