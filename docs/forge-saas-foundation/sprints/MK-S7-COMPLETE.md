# MK-S7 Complete — Tenant Provisioning / Onboarding

**Program:** FORGE-SAAS-CORE  
**Sprint:** MK-S7  
**Completed:** 2026-08-10  
**Verdict:** PASS  
**Repair passes used:** 1

## Objective achieved

Tenants stay `PROVISIONING` until onboarding activation checks pass; default facility is ensured; open onboarding blocks direct activate; template step skips are resolvable.

## Scope completed

- `onboarding-domain.ts` + unit tests (`resolveOnboardingSteps`, required keys)
- Session start uses resolved steps; `GET .../onboarding/templates`
- `ensureDefaultFacility` on activate
- `TenantsService.activate` gated unless `{ fromOnboarding: true }`
- Unit tests: failed checks, facility ensure, bypass block
- `ONBOARDING.md`; BACKLOG-017/018

## Reused

- ADR-027 OnboardingService / activation checks / starter templates

## Extended

- Step skip overrides; facility bootstrap; activate bypass protection

## New

- `packages/contracts/src/onboarding-domain.ts`
- Templates GET route on onboarding controller

## Verification

| Check                       | Result    |
| --------------------------- | --------- |
| contracts onboarding-domain | 3 passed  |
| tenants + onboarding unit   | 14 passed |
| platform-api typecheck      | PASS      |
| Production operations       | NONE      |

## Next sprint

NOT AUTHORIZED.
