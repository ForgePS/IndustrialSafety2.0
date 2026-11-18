# Sprint 1E Plan — Platform Hardening and Customer Launch Foundation

**Predecessor:** Sprint 1D — Platform Core Foundation  
**Objective:** Turn the deployed platform core into a secure, dependable foundation for onboarding the first Forge Industrial, Forge RMS, and Forge Academy customers.  
**Status:** IN PROGRESS (Wave 0 complete)

## Scope

This sprint closes the ten gaps carried out of Sprint 1D:

1. Cognito invitation acceptance, hardened against half-created users.
2. Dedicated tenant membership CRUD as the access-granting aggregate.
3. Idempotency-Key persistence for unsafe mutations.
4. If-Match optimistic concurrency for updates and state transitions.
5. Automated end-to-end tenant isolation and subscription tests.
6. Full outbox-to-worker proof, from domain write to worker side effect.
7. HTTPS and a development preview path, gated on DNS delegation.
8. Resumable customer onboarding.
9. Platform API Contract v1, frozen and documented.
10. Cost and operational monitoring (budgets, dashboards, alarms, runbooks).

## Out of scope

- Broad product-module development (Industrial, RMS, Academy engines).
- Firebase migration.
- Production and GovCloud deployment.
- Payment processor integration.

## Architecture decisions

| ADR                                                                       | Summary                                                                                                                 |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| [ADR-020](../decisions/ADR-020-invitation-lifecycle.md)                   | Invitation lifecycle and Cognito identity linkage; identity links only at acceptance.                                   |
| [ADR-021](../decisions/ADR-021-tenant-membership-model.md)                | `user_tenant_memberships` as the authoritative access-granting aggregate; only ACTIVE grants access.                    |
| [ADR-022](../decisions/ADR-022-durable-idempotency.md)                    | Durable `idempotency_records` claimed by a NestJS interceptor for unsafe mutations.                                     |
| [ADR-023](../decisions/ADR-023-optimistic-concurrency.md)                 | Optimistic concurrency via `record_version` with ETag and If-Match.                                                     |
| [ADR-024](../decisions/ADR-024-event-processing-idempotency.md)           | EventBridge to SQS routing with idempotent, per-handler worker processing.                                              |
| [ADR-025](../decisions/ADR-025-edge-tls-and-dns.md)                       | Edge TLS, DNS, ACM, ALB redirect, and WAF; HTTPS fully implemented in CDK but gated on a `domains` configuration block. |
| [ADR-026](../decisions/ADR-026-creator-console-hosting.md)                | Creator Console hosted on CloudFront and a private S3 bucket (static export).                                           |
| [ADR-027](../decisions/ADR-027-customer-onboarding-sessions.md)           | Resumable, persisted customer onboarding sessions with a server-side activation gate.                                   |
| [ADR-028](../decisions/ADR-028-platform-api-versioning.md)                | Platform API Contract v1 and the v1-to-v2 versioning policy.                                                            |
| [ADR-029](../decisions/ADR-029-identity-resolution-without-rls-bypass.md) | SECURITY DEFINER lookup functions owned by `forge_identity_lookup`; no `forge_app` RLS bypass.                          |

## Database migrations

Sequential migrations under `packages/database/drizzle/`:

| Migration                                               | ADRs                               | Contents                                                                                                                                                                                                                        |
| ------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0003_sprint_1e_membership_and_invitations.sql`         | ADR-020, ADR-021                   | `user_invitations`, `user_tenant_memberships`, `membership_role_assignments`, `membership_product_access`, `membership_module_access`, `membership_history`; user session and auth-failure tracking; `record_version` on users. |
| `0004_sprint_1e_idempotency_concurrency_onboarding.sql` | ADR-022, ADR-023, ADR-024, ADR-027 | `idempotency_records`, `event_processing_records`, `customer_onboarding_sessions`, `customer_onboarding_steps`; `record_version` on concurrency-controlled tables.                                                              |
| `0005_sprint_1e_identity_resolution.sql`                | ADR-029                            | `forge_identity_lookup` role, narrow SELECT policies, `forge_lookup_identity`, `forge_lookup_invitation`, `forge_lookup_user_tenants`; `users.sessions_revoked_at`.                                                             |

All new tenant-owned tables: audit columns, required indexes and uniqueness constraints, RLS enabled and forced. `forge_app` cannot bypass RLS on direct table access.

**Local status:** 0003 and 0004 applied locally; 0005 SQL written, apply and verify before auth bootstrap ships.

## Execution waves

Ordered work aligned with directive section 17 (deployment sequence).

### Wave 0 — Plan and ADRs

- [x] Sprint 1E plan (this document).
- [x] ADR-020 through ADR-029.

### Wave 1 — Database migrations and schema/seed

- Apply and verify migrations 0003, 0004, and 0005 locally (`pnpm db:migrate:local`).
- Update seeds for membership, invitation, and onboarding fixtures.
- Verify RLS policies and partial unique indexes (invitation per tenant+email, idempotency scope, event handler dedup).
- Aurora deployment via one-off ECS migrate task (same pattern as Sprint 1D).

### Wave 2 — Idempotency and optimistic concurrency

- NestJS idempotency interceptor: claim `idempotency_records` before mutation; replay COMPLETED; reject hash mismatch and in-flight duplicates.
- ETag generation on reads; require If-Match on PATCH, PUT, and state transitions; 428 without header, 412 on stale version.
- Initial mutation coverage: tenant, organization, person, invitation, membership, subscription, entitlement, feature-flag.
- Initial concurrency coverage: tenants, organizations, persons, users, memberships, roles, entitlements, subscriptions, feature flags, configuration, branding.

### Wave 3 — Invitation lifecycle, membership CRUD, auth session endpoints

- Invitation aggregate: states DRAFT through FAILED; Cognito AdminCreateUser at send; identity link at acceptance only.
- Endpoints: `POST/GET /api/v1/auth/invitations`, resend, revoke, accept; `GET /api/v1/auth/me`, `POST select-tenant`, `POST logout-all`.
- Membership CRUD and lifecycle: `GET/POST/PATCH /api/v1/memberships`, activate, suspend, revoke; roles and products PUT/GET.
- Multi-tenant membership selection; server-side membership verification; session version and `sessions_revoked_at` guards (ADR-029).
- Auth failure tracking; last-login tracking; audit and outbox events on every transition.

### Wave 4 — EventBridge to SQS and idempotent worker

- EventBridge rule: `source = forge.platform` → integration-events SQS queue; DLQ after max receives.
- Worker SQS consumer loop with typed handler registry; insert into `event_processing_records` before handler invocation.
- Handlers run inside `withTenantTransaction`; reject tenantless or malformed events to DLQ.
- Proof events: `TenantCreated`, `UserInvitationCreated`, `MembershipActivated`, `SubscriptionStatusChanged`, `FeatureFlagChanged`.
- Structured logs and EMF-style duration and failure metrics.
- Cost control: `pnpm worker:enable:development` / `pnpm worker:disable:development`; desired count returns to 0 after proof.

### Wave 5 — Onboarding sessions and starter templates

- Onboarding wizard API: eleven steps from tenant creation through activation (ADR-027).
- Customer types: INDUSTRIAL, FIRE_DEPARTMENT, FIRE_ACADEMY, OTHER.
- Starter templates configure entitlements and roles only (Industrial, RMS, Academy); no product-module implementation.
- Activation gate: primary org, product, subscription, admin invitation, security, branding, no critical errors.
- CLI: `pnpm platform:onboard-tenant`.

### Wave 6 — CDK edge, console hosting, budgets, dashboards, alarms

- HTTPS stack (ADR-025): Route 53 lookup, ACM DNS validation, 443 listener, HTTP→HTTPS redirect, alias records, certificate-expiry alarm, WAF association, secure headers — all gated on `domains.hostedZoneName`. Development stays HTTP until DNS is delegated externally.
- Creator Console hosting (ADR-026): S3 private bucket, CloudFront with OAC, response headers policy, SPA rewrite; deploy to `console-dev.forgepublicsafety.com` when domains block is set.
- AWS Budgets for Development, Testing, Staging, Production (50/80/100/120% alert thresholds).
- CloudWatch dashboards: API requests/errors/latency, ECS tasks, Aurora capacity, EventBridge failures, SQS/DLQ depth, worker failures, Cognito failures, WAF blocks, S3 growth, release metadata.
- Alarms: API/readiness failure, ECS crash loop, Aurora saturation, queue backlog, DLQ messages, event delivery failure, auth anomaly, backup failure, certificate expiration, budget threshold.

### Wave 7 — Creator Console screens

- Real-API screens with loading, empty, and error states; search, filters, sorting, pagination; permission-aware actions.
- New and expanded: invitations, memberships, onboarding wizard, dashboard (pending invitations, suspended memberships, queue health, deployment info).
- Existing screens retained: tenants, organizations, persons, users, roles, permissions, products, entitlements, subscriptions, feature flags, branding, configuration, audit, platform health.
- No mock-only pages or inactive buttons.

### Wave 8 — Automated tests and CI jobs

- E2E scenarios (directive section 8): tenant isolation, RLS via `forge_app`, role enforcement, creator-permission denial, product/module blocks, membership suspension, invitation acceptance, double-accept rejection, idempotency replay and hash rejection, concurrent 412, subscription state enforcement.
- Outbox-to-worker integration proof in CI (worker temporarily enabled).
- CI jobs: unit, integration, RLS, E2E, migration validation, CDK synth, container build, dependency scanning, secret scanning.

### Wave 9 — API contract and runbooks

- Freeze and document Platform API Contract v1:
  - `docs/api/platform-contract-v1.md`
  - `docs/api/platform-openapi-v1.yaml`
  - `docs/api/platform-events-v1.md`
  - `docs/api/platform-permissions-v1.md`
  - `docs/api/platform-errors-v1.md`
  - `docs/api/platform-versioning-policy.md`
- Operational runbooks:
  - `docs/operations/authentication-failure-runbook.md`
  - `docs/operations/tenant-access-runbook.md`
  - `docs/operations/worker-failure-runbook.md`
  - `docs/operations/queue-dlq-runbook.md`
  - `docs/operations/database-migration-runbook.md`
  - `docs/operations/customer-onboarding-runbook.md`
  - `docs/operations/development-cost-control.md`

### Wave 10 — Deploy and verify

1. Run all quality gates (`pnpm lint`, `typecheck`, `test`, `test:integration`, `test:rls`, `test:e2e`, `test:platform-e2e`, `build`, `infra:synth`, `infra:diff:development`).
2. Build immutable container images.
3. Deploy infrastructure and services (`pnpm infra:deploy`).
4. Aurora migrate and seed via one-off ECS tasks.
5. Temporarily enable worker; prove full pipeline (API → outbox → EventBridge → SQS → worker → audit/metrics).
6. Disable worker (desired count 0).
7. Verify HTTPS and smoke tests when DNS delegated; HTTP smoke until then (`pnpm smoke:development`).
8. Onboard three synthetic acceptance tenants (Industrial Demo, RMS Demo Fire Department, Academy Demo).
9. Generate `docs/sprints/SPRINT-1E-summary.md` and update `docs/project-status.md`.

## Known external dependencies

HTTPS on `api-dev.forgepublicsafety.com` and `console-dev.forgepublicsafety.com` is blocked on Route 53 delegation: the development AWS account currently has no hosted zone for `forgepublicsafety.com`, so a DNS-validated ACM certificate cannot be issued. Per ADR-025, the capability ships as gated configuration; the full HTTPS path is built and testable now and is enabled by setting the `domains` block once the hosted zone is delegated.

## Cost posture

- Developer cost profile preserved; worker desired count 0 in steady state.
- CloudFront plus S3 hosting for the Creator Console adds roughly $1/month.
- No NAT or Aurora capacity changes.
- Budget alarms at 50/80/100/120% for Development.

## Definition of done

Sprint 1E is complete when every item in directive section 19 passes, including: invitation acceptance end-to-end, membership CRUD and suspension, idempotency and concurrency on required mutations, E2E isolation and subscription tests, outbox-to-worker proof, HTTPS/console deploy (or HTTP with gated HTTPS ready), onboarding without database access, starter templates, API Contract v1, budgets/dashboards/alarms/runbooks, migrations on local and Aurora, all required commands green, no critical security defect, and developer steady-state cost controlled.

## Already implemented (do not redo)

- Wave 1 migrations 0003 and 0004 applied locally.
- Wave 2 idempotency interceptor exists.
- Wave 3 memberships service and controller exist; `CognitoAdminService` exists.
- Migration 0005 SQL written; apply and wire auth bootstrap before treating identity resolution as done.
