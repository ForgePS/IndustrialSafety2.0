# MK-S1 Complete — Core Tenant Domain

**Program:** FORGE-SAAS-CORE  
**Sprint:** MK-S1  
**Completed:** 2026-08-10  
**Verdict:** PASS  
**Repair passes used:** 2

## Objective achieved

One authoritative tenant domain is documented and hardened:

- Canonical tenant statuses including TRIAL and CANCELED
- Canonical `facilities` table + ownership enforcement
- Departments via organizations (`DEPARTMENT` org type)
- Existing tenant products/modules reused with assignment tests
- Tenancy map in `docs/forge-saas-foundation/TENANCY.md`

## Scope completed

- Status registry + transitions in `@forge/contracts`
- Operational state for TRIAL / CANCELED in `@forge/authorization`
- `TenantsService` transition hardening + start-trial / cancel APIs
- Additive migration `0028_mk_s1_tenant_domain.sql` (not executed in production)
- `FacilitiesModule` API under `/api/v1/tenants/:tenantId/facilities`
- Permissions `tenant.facilities.read` / `tenant.facilities.manage`
- Unit tests for create/read/update tenant, invalid transition, facility ownership, cross-tenant deny, product/module assignment

## Reused

- `tenants`, `tenant_settings`, `tenant_branding`, `tenant_domains`
- `tenant_products`, `tenant_module_entitlements`, `EntitlementsService`
- Organizations as department hierarchy

## Extended / New

- EXTEND: tenant lifecycle statuses + transitions
- NEW: `facilities` table/API (canonical sites)
- EXTEND: seed `DEPARTMENT` organization type

## Out of scope (honored)

- Billing UX, invitation UX, Creator Console redesign
- Production migration apply / deploy
- Forced sync of Config Studio / RMS stations into `facilities` (BACKLOG-010 partial)

## Verification

| Check                                         | Result                                                       |
| --------------------------------------------- | ------------------------------------------------------------ |
| `@forge/contracts` unit                       | 5 passed                                                     |
| `@forge/authorization` unit                   | 9 passed                                                     |
| `@forge/platform-api` unit                    | 53 passed (includes tenants 8, facilities 3, entitlements 2) |
| Typecheck (platform-api + domain packages)    | PASS after Repair Pass 1                                     |
| Build (contracts without untracked analytics) | PASS after Repair Pass 2                                     |
| Production operations                         | NONE                                                         |

## Repair Pass 1

Fixed `exactOptionalPropertyTypes` issue when passing optional audit `metadata` from `TenantsService.transition`.

## Repair Pass 2

Removed accidental unfinished `industrial-analytics` re-export from `packages/contracts/src/index.ts` that had been mixed in from unrelated WIP during commit staging.

## Commits

- `7cef4b1` feat(saas): establish MK-S1 canonical tenant domain
- `17d138a` fix(saas): remove incomplete industrial-analytics re-export from MK-S1

## Next sprint

NOT AUTHORIZED.
