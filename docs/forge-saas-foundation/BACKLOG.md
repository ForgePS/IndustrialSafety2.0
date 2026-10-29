# FORGE-SAAS-CORE Backlog

Items discovered during sprints but not authorized for implementation.

---

## BACKLOG-001

Discovered During:
MK-S0

Description:
Industrial Cognito client / CloudFormation export (`ForgeIdentity-IndustrialClientId`) is expected by compute/deploy scripts but appears incomplete on `ForgeCognito` construct relative to academy/rms/creator/department/student clients.

Reason Deferred:
Identity client wiring is outside MK-S0 documentation scope; belongs with auth hardening or industrial product work.

Suggested Sprint:
MK-S2

Priority:
MEDIUM

Blocking Current Sprint:
NO

---

## BACKLOG-002

Discovered During:
MK-S0

Description:
Industrial web UI calls `/api/v1/industrial/analytics/*` and related industrial site APIs that are not present on `platform-api` in this baseline.

Reason Deferred:
Product analytics / industrial API parity is not SaaS-core foundation work for MK-S0 and is already in-progress separately in the working tree.

Suggested Sprint:
(product track — industrial analytics); optional SaaS analytics later in MK-S20

Priority:
HIGH

Blocking Current Sprint:
NO

---

## BACKLOG-003

Discovered During:
MK-S0

Description:
No Stripe (or other PSP) adapter; subscriptions use `billingProvider` default `NONE`. Provider-neutral billing domain exists partially.

Reason Deferred:
MK-S9 shipped provider-neutral domain + STUB webhook. **Live Stripe/PSP adapter** and production webhook endpoints remain deferred.

Suggested Sprint:
MK-S10 / PSP adapter track

Priority:
HIGH

Blocking Current Sprint:
NO

Resolution Note (MK-S9):
Domain models, status normalizer, stub webhook with signature + idempotency + entitlement sync via EntitlementsService. Live Stripe still open.

---

## BACKLOG-004

Discovered During:
MK-S0

Description:
No SES / notification delivery engine. SQS notification queue and Config Studio email/notification templates exist; Cognito handles invite email in non-branded cases.

Reason Deferred:
Notification/email sprint is MK-S13.

Suggested Sprint:
MK-S13

Priority:
HIGH

Blocking Current Sprint:
NO

Status:
PARTIALLY_RESOLVED_MK_S13 — inbox API/UI + Noop/SES stub + seeded templates shipped; production SES identity, injected SES client, and notification SQS worker consumer remain deferred.

---

## BACKLOG-005

Discovered During:
MK-S0

Description:
No first-class tenant/platform API key product (hash, prefix, scopes, revoke). Import adapters have source `api_key` auth type which is unrelated.

Reason Deferred:
API keys / webhooks productization is MK-S15.

Suggested Sprint:
MK-S15

Priority:
MEDIUM

Blocking Current Sprint:
NO

Status:
RESOLVED_MK_S15 — tenant API keys (`forge_live_`, hash-at-rest, show-once, revoke) shipped; API-key bearer auth middleware remains deferred.

---

## BACKLOG-006

Discovered During:
MK-S0

Description:
Generic outbound customer webhooks are not productized. CAD inbound webhook security patterns exist and should be reused as a model.

Reason Deferred:
MK-S15 scope.

Suggested Sprint:
MK-S15

Priority:
MEDIUM

Blocking Current Sprint:
NO

Status:
RESOLVED_MK_S15 — outbound endpoints, HMAC, deliveries, replay, disable + TA UI shipped; async worker/KMS encryption remain deferred.

## BACKLOG-007

Discovered During:
MK-S0

Description:
Department portal, student portal, and public registration apps are placeholders (`NOT_STARTED`) despite Cognito app clients existing.

Reason Deferred:
Portal product delivery is outside early SaaS core sprints; foundation already supports shared Cognito + memberships.

Suggested Sprint:
After MK-S8 / product backlog

Priority:
LOW

Blocking Current Sprint:
NO

---

## BACKLOG-008

Discovered During:
MK-S0

Description:
Creator Console still uses a local API client (`apps/creator-console/src/lib/api.ts`) instead of consolidating fully on `@forge/web-kit`.

Reason Deferred:
Client consolidation is a refactor risk; not required for baseline.

Suggested Sprint:
MK-S8 or MK-S17

Priority:
LOW

Blocking Current Sprint:
NO

---

## BACKLOG-009

Discovered During:
MK-S0

Description:
Dual UI tracks: Industrial uses vendored Sneat Free; RMS uses `@forge/fx-*`; Creator/Tenant Admin use `@forge/ui` + design-system. SaaS shell sprint must not force a redesign of operational modules.

Reason Deferred:
Originally deferred to MK-S8. **MK-S8 acceptance:** multi-track preserved; shared _behaviors_ (chrome affordances + shell states) via `@forge/ui` / docs; Industrial remains Sneat; RMS untouched. Full visual unification remains out of scope.

Suggested Sprint:
MK-S8 (behaviors done); visual unification never required by Forge SaaS program

Priority:
MEDIUM

Blocking Current Sprint:
NO

Resolution Note (MK-S8):
Documented in `SHELL.md`. Chrome parity landed without module redesign.
---

## BACKLOG-010

Discovered During:
MK-S0

Description:
“Facilities” appear as Configuration Studio namespaces / documents in tenant-admin/creator, while RMS sites map to `rms_stations`. No single canonical SQL `facilities` table for all products.

Reason Deferred:
Partial resolution in MK-S1: canonical `facilities` table + API added. Sync adapters from Config Studio / RMS stations remain deferred.

Suggested Sprint:
MK-S8 / product tracks

Priority:
MEDIUM

Blocking Current Sprint:
NO

Resolution Note (MK-S1):
Canonical `facilities` table + `FacilitiesService` ownership checks landed. Adapter cutover not done.

---

## BACKLOG-011

Discovered During:
MK-S4

Description:
Migrate remaining product-surface authorization checks (RMS, Industrial, Import specialty paths, role-name conditionals if any) onto permission codes + `@RequirePermission` / central evaluation. MK-S4 only covered core SaaS controllers and evaluation hardening.

Reason Deferred:
Directive forbids uncontrolled all-product rewrite in MK-S4.

Suggested Sprint:
Product tracks + incremental SaaS follow-ups

Priority:
MEDIUM

Blocking Current Sprint:
NO

---

## BACKLOG-012

Discovered During:
MK-S4

Description:
Tenant custom-role management UI (list/create/edit permissions, assign to memberships). API + schema support already exist (`AuthorizationService`, `isSystemManaged=false` roles).

Reason Deferred:
MK-S4 required architecture only; full UI not required unless trivial.

Suggested Sprint:
MK-S7 / admin UX track

Priority:
LOW

Blocking Current Sprint:
NO

---

## BACKLOG-013

Discovered During:
MK-S5

Description:
Wire `requiresEntitlement` on remaining product controllers (RMS NERIS, CAD, Industrial, Import specialty, AI narrative). MK-S5 only gated facilities as the representative Industrial surface.

Reason Deferred:
Directive forbids uncontrolled all-product rewrite.

Suggested Sprint:
Product tracks + incremental SaaS follow-ups

Priority:
MEDIUM

Blocking Current Sprint:
NO

---

## BACKLOG-014

Discovered During:
MK-S5

Description:
Enforce `quantityLimit` (seats) on `tenant_module_entitlements` and auto-grant products/modules from `subscription_plans.configurationJson` when billing sync lands.

Reason Deferred:
MK-S9 billing domain; not required for MK-S5 catalog/helpers.

Suggested Sprint:
MK-S9

Priority:
MEDIUM

Blocking Current Sprint:
NO

---

## BACKLOG-015

Discovered During:
MK-S5

Description:
Module codes such as `CORE` are reused across products; principal `activeModules` is a flat set. Prefer product-scoped module checks or namespaced codes for stronger gates.

Reason Deferred:
Requires product migration; facilities gate uses productCode only.

Suggested Sprint:
Product tracks / MK-S11 Creator module UX

Priority:
LOW

Blocking Current Sprint:
NO

---

## BACKLOG-016

Discovered During:
MK-S6

Description:
Enforce facility ACL on product APIs using membership `facility_ids_json` (currently a stored scope hint). Optional scheduled job to mark invitations EXPIRED when past `expiresAt`.

Reason Deferred:
MK-S6 stores and validates facility IDs; product surface enforcement and cron expire are follow-ups.

Suggested Sprint:
Product tracks / MK-S16 ops

Priority:
LOW

Blocking Current Sprint:
NO

---

## BACKLOG-017

Discovered During:
MK-S7

Description:
Full dynamic onboarding step engine (persist product-defined step graphs, Creator Console path sync, reorder/insert custom steps beyond skip overrides).

Reason Deferred:
MK-S7 ships resolveOnboardingSteps + template skip keys on the fixed ADR-027 checklist; deeper engine is larger than one sprint.

Suggested Sprint:
MK-S11 / Creator Console track

Priority:
MEDIUM

Blocking Current Sprint:
NO

---

## BACKLOG-018

Discovered During:
MK-S7

Description:
Seed tenant notification defaults and feature-flag defaults during onboarding activate (SES/template wiring still out of band per BACKLOG-004).

Reason Deferred:
No notification delivery engine yet; facility/settings/product gates closed for MK-S7.

Suggested Sprint:
MK-S8 / notifications track after SES adapter

Priority:
MEDIUM

Blocking Current Sprint:
NO
