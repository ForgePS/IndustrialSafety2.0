# MK-S3 Complete — Membership / Tenant Context

**Program:** FORGE-SAAS-CORE  
**Sprint:** MK-S3  
**Completed:** 2026-08-10  
**Verdict:** PASS  
**Repair passes used:** 0

## Objective achieved

Authoritative membership (`user_tenant_memberships`) gates tenant selection. SaaS pending/active/inactive/removed map onto PENDING/ACTIVE/SUSPENDED/REVOKED without schema rename. Client tenant switch replaces AuthMe and rolls back persistence on failure.

## Scope completed

- Membership status alias helpers in `@forge/contracts`
- `selectTenant` / list selectable use `isMembershipStatusActive`
- `switchActiveTenant` helper + web-kit wiring
- Tests: single/multi tenant, non-member, suspended, revoked, switch rollback
- `MEMBERSHIPS.md` documentation

## Reused

- ADR-021 memberships service/API
- Auth select-tenant endpoint

## Extended

- Explicit SaaS status vocabulary mapping
- Safer client tenant switch

## New

- membership-domain contracts
- tenant-switch web-kit helper
- select-tenant security/unit coverage

## Verification

| Check                                    | Result    |
| ---------------------------------------- | --------- |
| contracts unit                           | 8 passed  |
| web-kit unit                             | 16 passed |
| platform-api unit                        | 67 passed |
| typecheck contracts/web-kit/platform-api | PASS      |
| Production operations                    | NONE      |

## Next sprint

NOT AUTHORIZED.
