# Onboarding / Tenant Provisioning (MK-S7)

ADR-027 onboarding sessions provision tenants that start in `PROVISIONING` and become `ACTIVE` only after server-side activation checks succeed.

## Lifecycle

1. `POST /api/v1/platform/onboarding/sessions` creates a tenant (`PROVISIONING`) and an `IN_PROGRESS` session.
2. Operators complete steps via `POST .../sessions/:sessionId/steps/:stepKey/complete`.
3. `POST .../sessions/:sessionId/activate` runs `runActivationChecks`, ensures a default facility exists, then activates the tenant.
4. Failed checks leave the tenant `PROVISIONING` and never call tenant activate.

## Checklist (ADR-027 steps)

Default steps live in `@forge/contracts` (`ONBOARDING_STEPS` / `DEFAULT_ONBOARDING_STEPS`). Templates may set `onboarding.skipStepKeys` for optional steps; `CREATE_TENANT` and `ACTIVATE_TENANT` cannot be skipped (`resolveOnboardingSteps`).

| Area                  | How it is covered                                                     |
| --------------------- | --------------------------------------------------------------------- |
| Tenant                | Created at session start as `PROVISIONING`                            |
| Owner / admin         | `CREATE_PRIMARY_ADMINISTRATOR` + `SEND_INVITATION`                    |
| Roles                 | Starter template `ensureStarterRoles`                                 |
| Settings / security   | Review step + security namespace settings                             |
| Products / modules    | Entitlement steps                                                     |
| Facility              | Auto-created at activate if none exist (`default` / Primary Facility) |
| Billing               | `CONFIGURE_SUBSCRIPTION` (or waiver)                                  |
| Notification defaults | Deferred (BACKLOG)                                                    |

## Templates

`GET /api/v1/platform/onboarding/templates` lists starter templates with resolved step lists and skip keys.

## Bypass protection

Direct `TenantsService.activate` throws `CONFLICT` while an `IN_PROGRESS` onboarding session exists for the tenant. Onboarding activation passes `{ fromOnboarding: true }`.

## Failure semantics

- Incomplete prior steps → `CONFLICT`
- Activation check failures → `BAD_REQUEST` with `activationErrorsJson` persisted; tenant stays `PROVISIONING`
- Concurrency via `If-Match` / `recordVersion`

## CLI

`scripts/onboard-tenant.ts` remains the operator helper for scripted runs.
