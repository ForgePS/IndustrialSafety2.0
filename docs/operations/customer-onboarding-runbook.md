# Customer Onboarding Runbook

**Sprint:** 1E  
**Scope:** Resumable onboarding sessions, starter templates, activation gate  
**Related:** [ADR-027](../decisions/ADR-027-customer-onboarding-sessions.md), [platform-contract-v1.md](../api/platform-contract-v1.md)

## Overview

Customer onboarding creates a tenant in `PROVISIONING` at step 1 and transitions to `ACTIVE` only when the server-side activation gate passes. Sessions persist in `customer_onboarding_sessions` and `customer_onboarding_steps`.

HTTP handlers ship in Sprint 1E Wave 5. Until then, use API where available and database inspection for diagnostics.

## Customer types and templates

| Customer type     | Starter template     | Product            |
| ----------------- | -------------------- | ------------------ |
| `INDUSTRIAL`      | `INDUSTRIAL_STARTER` | `FORGE_INDUSTRIAL` |
| `FIRE_DEPARTMENT` | `RMS_STARTER`        | `FORGE_RMS`        |
| `FIRE_ACADEMY`    | `ACADEMY_STARTER`    | `FORGE_ACADEMY`    |
| `OTHER`           | manual selection     | varies             |

Templates configure entitlements and role templates only — not product module engines ([starter-templates.ts](../../packages/contracts/src/starter-templates.ts)).

## Eleven steps

From `@forge/contracts` `ONBOARDING_STEPS`:

1. CREATE_TENANT
2. SELECT_CUSTOMER_TYPE
3. CREATE_PRIMARY_ORGANIZATION
4. SELECT_PRODUCTS
5. SELECT_MODULES
6. CONFIGURE_SUBSCRIPTION
7. CONFIGURE_BRANDING
8. CREATE_PRIMARY_ADMINISTRATOR
9. SEND_INVITATION
10. REVIEW_CONFIGURATION
11. ACTIVATE_TENANT

Each step records status (`PENDING`, `COMPLETED`, `SKIPPED`, `FAILED`), payload JSON, and validation errors.

## Activation gate (server-enforced)

Tenant cannot activate until all checks pass:

- Primary organization exists
- At least one product enabled
- Subscription valid or explicitly waived
- Primary administrator invitation exists
- Security configuration valid
- Branding defaults valid
- No critical error in `activation_errors_json`

The Creator Console cannot bypass this gate.

## Planned API (Contract v1)

| Method | Path                                                       | Permission                   |
| ------ | ---------------------------------------------------------- | ---------------------------- |
| GET    | `/api/v1/platform/onboarding/templates`                    | `platform.onboarding.manage` |
| POST   | `/api/v1/platform/onboarding/sessions`                     | `platform.onboarding.manage` |
| GET    | `/api/v1/platform/onboarding/sessions/:sessionId`          | `platform.onboarding.manage` |
| POST   | `/api/v1/platform/onboarding/sessions/:sessionId/steps`    | `platform.onboarding.manage` |
| POST   | `/api/v1/platform/onboarding/sessions/:sessionId/activate` | `platform.onboarding.manage` |

CLI (Wave 5): `pnpm platform:onboard-tenant`

## Operational procedures

### Start onboarding (when API available)

1. Authenticate as creator principal with `platform.onboarding.manage`.
2. `POST /api/v1/platform/onboarding/sessions` with `StartOnboardingInput`.
3. Record `sessionId` and tenant id from response.

### Resume stalled session

1. `GET /api/v1/platform/onboarding/sessions/:sessionId`.
2. Inspect `currentStep`, step statuses, and `validationErrorsJson` on failed steps.
3. Complete pending step via `POST .../steps` with `stepKey` and `payload`.
4. Do not manually set tenant to ACTIVE in database.

### Diagnose activation failure

1. Read `activation_errors_json` on session row.
2. Verify prerequisites via standard API:
   - Organization list
   - Entitlements
   - Current subscription
   - Pending invitation for admin email
   - Branding GET
3. Fix data through normal platform APIs (not raw SQL).

### Synthetic acceptance tenants (Wave 10)

Onboard three demo tenants per sprint plan:

- Industrial Demo
- RMS Demo Fire Department
- Academy Demo

Document results in `SPRINT-1E-summary.md` (after deploy).

## Events

Successful completion emits `platform.onboarding.completed.v1` ([platform-events-v1.md](../api/platform-events-v1.md)).

## Creator Console hosting

Onboarding UI is served from CloudFront + S3 static export ([ADR-026](../decisions/ADR-026-creator-console-hosting.md)). Console calls platform API with Cognito tokens from the browser.

HTTPS for `console-dev` hostname is gated on Route 53 delegation ([ADR-025](../decisions/ADR-025-edge-tls-and-dns.md)).

## References

- [tenant-access-runbook.md](./tenant-access-runbook.md)
- [authentication-failure-runbook.md](./authentication-failure-runbook.md)
- [database-migration-runbook.md](./database-migration-runbook.md)
