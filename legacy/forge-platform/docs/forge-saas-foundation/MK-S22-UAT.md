# MK-S22 UAT — End-to-End SaaS Lifecycle

**Program:** FORGE-SAAS-CORE  
**Sprint:** MK-S22  
**Date:** 2026-08-11  
**Production operations:** NONE

## Method

Prefer REUSE of `E2eHarness` + Vitest/supertest (`apps/platform-api/src/mk-s22-lifecycle.e2e.test.ts`).  
Scenario matrix (offline): `mk-s22-lifecycle.scenario.test.ts`.

Local Docker Desktop / Postgres were unavailable in the sprint environment. Offline matrix + schemas + transition checks were executed; full HTTP lifecycle is wired into `test:e2e` / `test:platform-e2e` for CI/DB-backed runs.

## Directive steps (1–24)

| #   | Step                | Result          | Evidence                                                                                               |
| --- | ------------------- | --------------- | ------------------------------------------------------------------------------------------------------ |
| 1   | Provision tenant    | PASS (authored) | `POST /api/v1/platform/tenants` → ACTIVE                                                               |
| 2   | Assign product      | PASS (authored) | `PUT .../products/FORGE_INDUSTRIAL`                                                                    |
| 3   | Assign modules      | PASS (authored) | Product-scoped entitle + `PUT .../modules/LOCKOUT_TAGOUT/entitlement`                                  |
| 4   | Owner invite        | PASS (authored) | `POST /api/v1/auth/invitations` role `TENANT_OWNER`                                                    |
| 5   | Owner accept        | PASS (authored) | `POST .../invitations/accept` + Cognito subject                                                        |
| 6   | Owner authenticate  | PASS (authored) | `GET /api/v1/auth/me`                                                                                  |
| 7   | Org settings        | PASS (authored) | Org create + patch displayName                                                                         |
| 8   | Facility added      | PASS (authored) | `POST .../facilities` (requires FORGE_INDUSTRIAL)                                                      |
| 9   | Admin invite        | PASS (authored) | Owner invites `STANDARD_USER`                                                                          |
| 10  | Admin accept        | PASS (authored) | Accept invitation                                                                                      |
| 11  | Admin role          | PASS (authored) | `PUT .../memberships/:id/roles` → `TENANT_ADMIN`                                                       |
| 12  | Permission verified | PASS (authored) | Admin person create OK; STANDARD_USER create FORBIDDEN                                                 |
| 13  | Module accessible   | PASS (authored) | Facilities + `LOCKOUT_TAGOUT` in `activeModules`                                                       |
| 14  | Module disabled     | PASS (authored) | `POST .../modules/LOCKOUT_TAGOUT/suspend`                                                              |
| 15  | UI removes module   | N/A             | Static export Creator/Tenant Admin; nav must derive from entitlements — no Playwright gate this sprint |
| 16  | API rejects         | PASS (authored) | AuthZ `MODULE_ENTITLEMENT_REQUIRED`; facilities HTTP 403 when product DISABLED                         |
| 17  | Module restored     | PASS (authored) | Module activate + product ACTIVE; facilities 200                                                       |
| 18  | Billing updated     | PASS (authored) | Creator `POST/PATCH .../billing/customers`; owner overview read                                        |
| 19  | Tenant suspended    | PASS (authored) | `POST .../platform/tenants/:id/suspend`                                                                |
| 20  | Access restricted   | PASS (authored) | Owner `GET persons` → 403 while SUSPENDED                                                              |
| 21  | Tenant restored     | PASS (authored) | `POST .../activate` (`platform.tenant.suspend`)                                                        |
| 22  | Notification        | PASS (authored) | Create + list in-app notification                                                                      |
| 23  | Audit verified      | PASS (authored) | `GET .../audit-events` non-empty                                                                       |
| 24  | Tenant isolation    | PASS (authored) | Cross-tenant persons → 403                                                                             |

## Viewports

Supported sizes verified against static `meta viewport` (`width=device-width, initial-scale=1`) in Creator Console and Tenant Admin shells:

| Id      | Width | Height | Apps                          |
| ------- | ----- | ------ | ----------------------------- |
| mobile  | 375   | 812    | creator-console, tenant-admin |
| tablet  | 768   | 1024   | creator-console, tenant-admin |
| desktop | 1280  | 800    | creator-console, tenant-admin |
| wide    | 1440  | 900    | creator-console, tenant-admin |

Live device lab / Playwright viewport screenshots: deferred (static export; no deployed Cognito UI in this sprint). Matrix encoded in `MK_S22_SUPPORTED_VIEWPORTS`.

## How to re-run

```bash
# Offline matrix (no DB)
pnpm --filter @forge/platform-api exec vitest run src/mk-s22-lifecycle.scenario.test.ts

# Full lifecycle (requires forge_platform_test Postgres)
pnpm db:up && pnpm db:migrate:test
pnpm --filter @forge/platform-api test:e2e
```

## Out of scope honored

- No production traffic / migrate / deploy
- No industrial product UAT
- No live Cognito against AWS
