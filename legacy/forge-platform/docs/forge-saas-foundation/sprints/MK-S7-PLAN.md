# MK-S7 Plan — Tenant Provisioning / Onboarding

## Objective

Make customer provisioning reliable: tenants start `PROVISIONING`, become `ACTIVE` only when server activation checks succeed, and failures never mark a tenant ACTIVE falsely.

## Current State

- ADR-027 session/steps exist; `OnboardingService.start/completeStep/activate` implemented.
- `runActivationChecks` gates org/product/subscription/admin invite/security/branding.
- Gaps: no default facility provisioning; direct `TenantsService.activate` can bypass open onboarding sessions; no product step-override helper; thin dedicated unit tests; templates GET missing.

## Reuse

- OnboardingService / TenantsService.create (PROVISIONING)
- Starter templates / ensureStarterRoles
- Activation checks + session FAILED step recording

## Changes Required

1. `onboarding-domain.ts`: resolve steps with product/template skip overrides; activation error codes.
2. Auto-create default facility on activate when none exist (user choice).
3. Block direct tenant activate while an `IN_PROGRESS` onboarding session exists.
4. Wire step resolution into session start (materialize skipped optional steps as SKIPPED when template requests).
5. `GET` onboarding templates listing.
6. Unit tests: failed checks do not call tenant activate; facility ensure; step resolver; bypass blocked.
7. `ONBOARDING.md`; backlog notification defaults / full step engine expansion.

## Files Expected

```text
docs/forge-saas-foundation/sprints/MK-S7-PLAN.md
docs/forge-saas-foundation/sprints/MK-S7-COMPLETE.md
docs/forge-saas-foundation/ONBOARDING.md
packages/contracts/src/onboarding-domain.ts (+ tests)
apps/platform-api/.../onboarding.service.ts (+ tests)
apps/platform-api/.../onboarding.controller.ts
apps/platform-api/.../tenants.service.ts
packages/contracts/src/starter-templates.ts (optional skip keys)
```

## Database Changes

None (facility uses existing MK-S1 table).

## Security Impact

- Prevent ACTIVE bypass while onboarding incomplete
- Activation remains server-side gate

## Tests Required

- failed activation checks leave tenant PROVISIONING (activate not called)
- ensure default facility when none
- open onboarding session blocks direct TenantsService.activate
- product/template step skip resolver

## Out of Scope

- Full dynamic step engine rewrite / Creator Console path sync (BACKLOG)
- Stripe / SES notification engine
- MK-S8+ shell
- Production migrations/ops

## Risks

- Template step skips must never skip `CREATE_TENANT` or `ACTIVATE_TENANT`.
- Auto-facility uses key `default` — collide only if caller pre-created same key (then reuse).
