# NERIS Phase 4 — Implementation Plan

**Created:** 2026-07-27  
**Authorization:** Phase 4 master Cursor build directive (CAD, hybrid intake, ingestion, matching, conflicts, operations)  
**AWS development account:** `511343547817` · **Region:** `us-east-1`  
**Status:** PLAN COMPLETE — coding not started  
**Phase 5:** NOT AUTHORIZED

SOC 2 remains a **readiness program** only. Do not claim certification, compliance, audit completion, Type 1, or Type 2.

---

## 1. Mission summary

Build a vendor-neutral CAD integration and hybrid incident-intake system inside Forge RMS. CAD is a **source of operational information**. Every CAD-created incident becomes a normal Forge NERIS incident using the existing incident model, numbering, workflow, specialty engine, validation, review, finalization, permissions, audit, RLS, and attachments.

Do **not** build a second reporting system. Do **not** begin Phase 5. Synthetic CAD data only. Development AWS account only.

---

## 2. Repository inventory (pre-coding)

### 2.1 Monorepo layout

| Area            | Location                                                           | Phase 4 relevance                                       |
| --------------- | ------------------------------------------------------------------ | ------------------------------------------------------- |
| Workspaces      | `pnpm-workspace.yaml` → `apps/*`, `packages/*`, `infrastructure/*` | New CAD packages under `packages/`                      |
| API             | `apps/platform-api` (NestJS)                                       | New CAD modules                                         |
| Worker          | `apps/worker-service` (ECS Fargate)                                | CAD queue processors (not Lambda)                       |
| RMS Web         | `apps/rms-web`                                                     | Ops dashboard, config, incident CAD UI                  |
| Creator Console | `apps/creator-console`                                             | Adapter/mapping templates, simulator admin              |
| E2E             | `apps/rms-web-e2e` (`@forge/rms-web-e2e`)                          | `@phase4` Cognito scenarios                             |
| Database        | `packages/database`                                                | Migrations **0013+** (latest applied pattern: **0012**) |
| Contracts       | `packages/contracts`                                               | Permissions, flags, API schemas                         |
| NERIS engine    | `packages/neris`                                                   | Specialty/validation reuse; no vendor fields            |
| Events / audit  | `packages/events`, `packages/audit`                                | Domain + audit event types                              |
| AuthZ           | `packages/authorization`                                           | Feature flag resolution                                 |
| CDK             | `infrastructure/cdk`                                               | Queues, IAM, alarms, optional CAD S3 prefix             |
| Scripts         | `scripts/run-ecs-migrate.mjs`, seed scripts                        | Approved migration path                                 |

### 2.2 Existing components to reuse

| Component                      | Path / pattern                                                                                                   | How Phase 4 uses it                                                                  |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Intake mode enum               | `tenant_neris_configuration.operating_mode` (`MANUAL_ONLY` \| `CAD_ENABLED` \| `HYBRID`) in `0007` + Zod overlay | Source of truth for intake mode; extend with CAD config columns                      |
| Incident shell                 | `neris-incidents` module + `0010` schema                                                                         | CAD creates/updates via existing create/update services — no parallel incident store |
| Incident numbering             | `incident-numbering.service.ts`                                                                                  | Reserve number inside CAD create transaction                                         |
| Field values + prefill         | `neris_incident_field_values`, `PREFILL_SOURCES` incl. `FUTURE_CAD`                                              | Promote `FUTURE_CAD` → `CAD` provenance; extend ownership                            |
| Form descriptor / specialty    | `@forge/neris` + form-descriptor service                                                                         | Activate workflows after CAD shell create                                            |
| Validation / review / finalize | Existing Phase 2–3 APIs                                                                                          | Non-blocking validation; finalized lock blocks CAD mutation                          |
| Feature flags                  | Seed `FEATURE_DEFINITIONS` + `FeatureFlagsService` + `FeatureGate`                                               | New `rms.cad.*` flags default **false**                                              |
| Permissions                    | `RMS_PERMISSIONS` → seed → `@RequirePermission`                                                                  | New `rms.cad.*` / `platform.cad.*`                                                   |
| Audit                          | `AuditService.writeInTransaction` + `@forge/audit` redaction                                                     | CAD audit actions; raw-payload access = high sensitivity                             |
| Idempotency                    | ADR-022 durable idempotency + `@Idempotent`                                                                      | HTTP + processing keys                                                               |
| Optimistic concurrency         | `record_version` / If-Match (ADR-023)                                                                            | Connections, links, conflicts, mappings                                              |
| RLS / FORCE RLS                | `rls.sql.ts` + migration loops; runtime `forge_app`                                                              | All CAD tables                                                                       |
| Outbox / EventBridge           | Worker outbox → domain bus → `integration-events` SQS                                                            | Emit `rms.neris.cad.*.v1` style events                                               |
| SQS queue-pair construct       | `forge-queues.ts` `queuePair()`                                                                                  | Add CAD intake / normalize / match / apply + DLQ                                     |
| Document S3 pattern            | `DocumentStorageService`, KMS, tenant-prefixed keys                                                              | Raw CAD payloads (separate prefix or bucket config)                                  |
| Secrets Manager                | ARN in config/DB; resolve at runtime (ADR-011)                                                                   | Webhook + connection credential ARNs only — **never** values in JSONB                |
| App DB secret                  | `forge-development-secrets-database-app`                                                                         | **Do not replace/rotate/recreate**                                                   |
| Worker processors              | `apps/worker-service/src/processors/`                                                                            | CAD consumers alongside existing SQS consumer                                        |
| Playwright Cognito             | `rms-web-e2e` globalSetup, tags in describe titles                                                               | Mirror `@phase3` → `@phase4`                                                         |
| Synthetic tenants              | A `rms-synthetic-fd`, B `rms-synthetic-fd-b`                                                                     | Flags on A only; cross-tenant tests with B                                           |

### 2.3 CAD stubs today (greenfield beyond these)

- `operating_mode` accepts `CAD_ENABLED` / `HYBRID` but **no runtime branching**
- `PREFILL_SOURCES` includes `FUTURE_CAD` (unused by prefill service)
- **No** adapters, webhooks, CAD tables, CAD queues, CAD UI, CAD flags, or CAD permissions
- NERIS dictionary fields such as `dispatch_cad_software` are schema metadata only

### 2.4 Naming conventions (adapted from directive)

Directive suggested folders are adapted to this repo:

| Concern                     | This repository                                                                                                                                                                            | Rationale                                                                       |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| Packages                    | `packages/cad-contracts`, `packages/cad-core`, `packages/cad-adapters`, `packages/cad-simulator`                                                                                           | Clear vendor-neutral boundaries; workspace already allows `packages/*`          |
| API modules                 | `apps/platform-api/src/modules/cad/` with subfolders (`connections`, `messages`, `mapping`, `matching`, `conflicts`, `operations`, `webhooks`, `simulator`)                                | Matches Nest kebab modules; avoids stuffing vendor logic into `neris-incidents` |
| Incident application bridge | Thin calls from CAD application worker into existing `NerisIncidentsService`                                                                                                               | CAD must not fork incident ownership                                            |
| Workers                     | `apps/worker-service/src/processors/cad-*.ts`                                                                                                                                              | Single ECS worker service pattern — not separate `workers/` apps                |
| Routes                      | Webhook: `POST /api/v1/cad/webhooks/:connectionPublicId`; tenant APIs: ` /api/v1/tenants/:tenantId/cad/...` **and** incident-scoped ` /api/v1/tenants/:tenantId/neris/incidents/:id/cad-*` | Aligns with Nest tenant routing while keeping public webhook IDs                |
| Feature flags               | Directive keys `rms.cad.*` / `platform.cad.*`                                                                                                                                              | Follow authorization directive (distinct from `rms.neris.*`)                    |
| Permissions                 | Directive keys `rms.cad.*` / `platform.cad.*`                                                                                                                                              | Same                                                                            |
| Audit actions               | `cad.connection.created`, `cad.message.received`, … (typed constants)                                                                                                                      | Match `@forge/audit` style with CAD namespace                                   |
| Domain events               | `rms.cad.*.v1` in `@forge/events`                                                                                                                                                          | Parallel to existing `rms.neris.*`                                              |
| Migrations                  | `0013_cad_connections` … `0018_cad_operations_and_retention`                                                                                                                               | Sequential after `0012`                                                         |
| UI (ops)                    | `apps/rms-web` — Configuration → Integrations → CAD; Operations → CAD Operations                                                                                                           | Tenant operators                                                                |
| UI (creator)                | `apps/creator-console` — Integrations / CAD templates                                                                                                                                      | Platform-only                                                                   |
| E2E                         | `tests/phase-4-*.spec.ts` + `@phase4` / `@cad*` tags                                                                                                                                       | Same tagging style as Phase 3                                                   |
| ADRs                        | `docs/decisions/` or `docs/architecture/adr/` (next free ADR numbers)                                                                                                                      | Existing ADR homes                                                              |

---

## 3. Delivery increments

| Increment | Scope                                                                                                                    | Exit criteria (summary)                                                                    |
| --------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| **4A**    | Contracts, schema, connections, raw messages, normalized events, mapping profiles, flags, permissions, audit event types | Migrations applied in CI/dev schema tests; packages compile; seeds present; no webhook yet |
| **4B**    | Secure webhook, auth, replay prevention, raw persist, queues, normalize worker, idempotency, DLQ                         | Signed webhook accepts/rejects; raw immutable; queue pipeline to NORMALIZED                |
| **4C**    | Matching, links, intake modes, manual link, provenance, ownership, conflicts, unit/personnel unknown queues              | CREATE_NEW / UPDATE / HYBRID link; conflicts; MANUAL_ONLY unchanged                        |
| **4D**    | Ops dashboard, connection UI, mapping admin, unknown queues, raw metadata, conflict UI, incident CAD panel               | Feature-gated UI; no secrets/raw by default                                                |
| **4E**    | Simulator, polling framework, observability, alarms, retention worker, replay tools, runbooks                            | Synthetic scenarios runnable; metrics/alarms; retention audited                            |
| **4F**    | Deploy, Cognito acceptance (30 scenarios), mobile, a11y, RLS, security, Phase 2/3 regression, final report               | Definition of Done; stop — no Phase 5                                                      |

After **every** increment: update status docs; lint; typecheck; unit tests; affected API/RLS tests; build; report completed / deferred / risks. Do not mark unverified work complete.

---

## 4. New components required

### 4.1 Packages

| Package                | Responsibility                                                                                                             |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `@forge/cad-contracts` | Types: adapter manifest, transports, raw/normalized events, acknowledgements, health, replay; Zod schemas shared by API/UI |
| `@forge/cad-core`      | Matching engine, ownership rules, idempotency key generation, out-of-order policy, cutoff policy — **no vendor parsers**   |
| `@forge/cad-adapters`  | Adapter registry; synthetic adapter; interfaces for future vendors; `NOT_IMPLEMENTED` transports                           |
| `@forge/cad-simulator` | Scenario definitions + signed payload builders (usable by API and e2e)                                                     |

### 4.2 API modules (`apps/platform-api/src/modules/cad/`)

| Submodule        | Responsibility                                                                 |
| ---------------- | ------------------------------------------------------------------------------ |
| `connections`    | CRUD, enable/disable, test, rotate-secret                                      |
| `webhooks`       | Public intake endpoint; HMAC; nonce/replay; persist; enqueue                   |
| `messages`       | List/metadata; reprocess; quarantine; replay (restricted)                      |
| `mapping`        | Profiles, rules, aliases, publish, unmapped resolve                            |
| `matching`       | Manual link helpers; duplicate review APIs                                     |
| `conflicts`      | List/resolve/ignore/escalate                                                   |
| `operations`     | Summary, metrics, health, queues, DLQ                                          |
| `simulator`      | Scenarios, send, outage, recover (flag-gated)                                  |
| `unit-personnel` | Unit/personnel mappings + unknown queues                                       |
| Bridge           | Application service calling `NerisIncidentsService` only through approved APIs |

### 4.3 Worker processors

| Processor           | Queue                         | Role                                   |
| ------------------- | ----------------------------- | -------------------------------------- |
| `cad-intake`        | cad-intake                    | Validate envelope; stage for normalize |
| `cad-normalization` | cad-normalization             | Adapter parse + normalize + mapping    |
| `cad-matching`      | cad-matching                  | Match decision                         |
| `cad-application`   | cad-application               | Apply to NERIS incident in transaction |
| `cad-polling`       | EventBridge schedule → poller | Polling adapters + simulator poll      |
| `cad-retention`     | Scheduled                     | Purge/archive per policy; audit        |

Shared DLQ: `cad-dead-letter` (+ redrive / manual reprocess).

### 4.4 Frontend

**RMS Web**

- Configuration → Integrations → CAD (connections, unit/personnel/call-type mapping, unmapped, fallback settings, testing)
- Operations → CAD Operations (dashboard, filters, actions)
- Incident workspace: CAD status strip, provenance indicators, CAD timeline tab, conflict panel entry
- Duplicate review queue; unknown unit/personnel queues; manual fallback UX

**Creator Console**

- Adapter templates, mapping templates, source versions, transformation rules, simulator, global diagnostics
- No tenant raw payloads without restricted support authorization

### 4.5 Database migrations (proposed)

| Migration                               | Contents                                                                      |
| --------------------------------------- | ----------------------------------------------------------------------------- |
| `0013_cad_connections`                  | `cad_connections`, tenant CAD config extensions, intake-mode constraints, RLS |
| `0014_cad_messages_and_events`          | `cad_raw_messages`, `cad_normalized_events`, comment timeline tables, RLS     |
| `0015_cad_mapping`                      | profiles, rules, aliases, versions, unmapped values, RLS                      |
| `0016_cad_webhook_lookup`               | SECURITY DEFINER `forge_lookup_cad_connection(public_id)` (ADR-029)           |
| `0017_cad_incident_links_and_conflicts` | links, conflicts, field provenance extension, RLS                             |
| `0018_cad_unit_personnel_mapping`       | unit/personnel mappings, unknown queues, unit events, RLS                     |
| `0019_cad_operations_and_retention`     | fallback/outage records, retention metadata, health logs, RLS                 |

Each: forward-safe; FORCE RLS; indexes; constraints; verification notes; **no** app-secret or Aurora replacement.

### 4.6 Tenant configuration fields (extend existing NERIS config)

- `intake_mode` (existing `operating_mode` — keep single source of truth; alias in API docs)
- `allow_manual_creation_when_cad_enabled`
- `manual_override_requires_reason`
- `manual_override_permission`
- `cad_update_cutoff_policy`
- `duplicate_match_threshold` / `possible_duplicate_threshold` / `auto_link_threshold`
- `require_match_review`
- `preserve_cad_comments`
- `caller_data_retention` / `raw_payload_retention`
- `cad_quiet_hours` / `cad_expected_operating_window`

### 4.7 Infrastructure changes

| Resource        | Approach                                                                                                                                                       |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SQS             | Extend `ForgeQueues` with cad-intake, cad-normalization, cad-matching, cad-application (+ DLQs); KMS; visibility tuned to worker duration                      |
| S3              | Raw payloads under `cad/{tenantId}/{connectionId}/{yyyy}/{mm}/{dd}/{rawMessageId}/payload` on documents bucket **or** dedicated prefix/config — no PII in keys |
| IAM             | Least-privilege grant API send; worker consume/read-write S3 CAD prefix; Secrets Manager read for webhook/credential ARNs                                      |
| EventBridge     | Polling schedule rules; retention schedule                                                                                                                     |
| Secrets         | Per-connection webhook secret ARNs; rotation with current/next/previous key IDs                                                                                |
| CloudWatch      | Metrics + alarms listed in directive §48; respect quiet hours / operating windows                                                                              |
| cdk-nag + tests | Required before deploy                                                                                                                                         |

**Do not:** multi-region; production CAD; regenerate `forge-development-secrets-database-app`; weaken FORCE RLS.

---

## 5. Security controls

| Control                                                       | Requirement                                                                                         |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Webhook auth                                                  | HMAC-SHA-256; timestamp + nonce + message-id; clock skew; constant-time compare; key rotation grace |
| Replay                                                        | Nonce/message-id cache; reject reused                                                               |
| Payload logging                                               | Summaries only; never full raw CAD in app logs                                                      |
| Secrets                                                       | Secrets Manager only; never in `configuration_json`                                                 |
| Raw payload API                                               | Separate permission `rms.cad.raw_payload.view_restricted`; high-sensitivity audit                   |
| Caller data                                                   | Separate permission; masked default; retention purge; classification mapping                        |
| RLS                                                           | All CAD tables FORCE RLS; cross-tenant tests required                                               |
| Feature flags                                                 | API-enforced; UI gate insufficient                                                                  |
| Finalized incidents                                           | Store/normalize/timeline/conflict only — no direct field mutation                                   |
| PRODUCTION connections                                        | Cannot enable in Phase 4 development                                                                |
| Rate limit / body size / content-type / optional IP allowlist | Enforced on webhook                                                                                 |

---

## 6. Permissions and feature flags

### Feature flags (default **false**)

`rms.cad.enabled`, `rms.cad.webhook.enabled`, `rms.cad.polling.enabled`, `rms.cad.hybrid.enabled`, `rms.cad.operations.enabled`, `rms.cad.raw_payload_access.enabled`, `rms.cad.simulator.enabled`, `platform.cad.adapter_management.enabled`

Enable only on approved synthetic development tenants (start with tenant A).

### Permissions

Seed all directive §40 permissions (`rms.cad.*`, `platform.cad.*`). Creator-only permissions not tenant-grantable. Raw payload not on ordinary tenant admin templates by default.

---

## 7. Test suites required

| Suite          | Coverage                                                                               |
| -------------- | -------------------------------------------------------------------------------------- |
| Unit           | Adapters, normalize, mapping, matching, ownership, out-of-order, cutoff, signature     |
| API            | All CAD endpoints: authZ, flags, schemas, concurrency                                  |
| RLS            | Every CAD table cross-tenant                                                           |
| Security       | Directive §51 matrix                                                                   |
| Worker / queue | Idempotency, DLQ, retry, reprocess                                                     |
| Playwright     | 30 scenarios `@phase4`; tags `@cad`, `@cad-security`, `@cad-hybrid`, `@cad-operations` |
| Mobile / a11y  | Viewports + screens in directive §54                                                   |
| Regression     | Full Playwright suite (Phase 2 + 3 must remain green)                                  |
| CDK            | Synth, nag, queue/IAM unit tests                                                       |

No real patient, citizen, caller, or CAD production data.

---

## 8. Documentation deliverables (later increments)

Architecture, API, user guides, testing plan, ADRs (vendor-neutral adapter, immutable raw storage, normalized contract, webhook auth, polling, idempotency, duplicate matching, field ownership, conflicts, finalized behavior, external secrets, retention), compliance evidence under `docs/compliance/soc2/evidence/neris-phase-4/`, status + final acceptance report.

**This plan** is the pre-coding gate. Architecture docs are created alongside increments, not before 4A schema.

---

## 9. Deployment sequence (Phase 4F)

1. Pre-deployment gate (directive §57): SSO, account `511343547817`, region `us-east-1`, Data `UPDATE_COMPLETE`, app secret ARN unchanged, API/RMS 200, ECS healthy, CloudTrail, alarms, lint/typecheck/tests/build/CDK/nag/synth/diff, no secret/Aurora replacement, rollback plan, commit SHA
2. Messaging / IAM / queue / worker infra (CDK)
3. Migrations via approved ECS migration task
4. Compute / API
5. Worker image (CAD processors)
6. Creator Console (if changed)
7. RMS Web + CloudFront invalidation
8. Feature flags on synthetic tenant only
9. Simulator setup
10. Acceptance tests
11. Post-deploy verification (directive §59)
12. Final acceptance report — **stop**

Rollback: disable feature flags → disable connections → pause workers / drain queues → revert Compute image → leave migrations forward-compatible (no destructive down required for emergency stop). Do not roll back Data stack secrets.

---

## 10. Estimated cost impact (development)

| Item                                  | Estimate                                                                  |
| ------------------------------------- | ------------------------------------------------------------------------- |
| Additional SQS queues + DLQs          | Low (pennies–few dollars/month at synthetic volume)                       |
| Extra S3 storage for raw CAD          | Low if retention short on synthetic tenants                               |
| Worker CPU (extra pollers)            | Low–moderate if polling interval ≥ 30s and synthetic-only                 |
| CloudWatch metrics/alarms             | Low                                                                       |
| Secrets Manager (per connection keys) | Low ($0.40/secret/month class)                                            |
| **Avoided**                           | Multi-region, always-on high-rate polling, separate Aurora, Lambda sprawl |

Exact numbers depend on message volume; track after 4E observability is live.

---

## 11. Risks

| Risk                                 | Mitigation                                                              |
| ------------------------------------ | ----------------------------------------------------------------------- |
| CAD application forks incident model | Force all writes through existing NERIS incident services               |
| Silent overwrite of manual fields    | Ownership policies + conflicts + tests scenario 23                      |
| Finalized mutation                   | Cutoff + finalized protection + scenario 9/25                           |
| Secret replacement via CDK drift     | GAP-009 importExistingAppSecret; exclusive deploys; preflight ARN check |
| Alarm noise                          | Quiet hours + expected operating window                                 |
| Scope creep into Phase 5             | Hard stop after final acceptance report                                 |
| Large synchronous webhook            | Persist + enqueue; ACK = accepted for processing                        |
| Cross-tenant leakage                 | FORCE RLS + Playwright tenant A/B + API tests                           |
| Adapter writes incidents             | Contract forbids; review gate in 4A                                     |

---

## 12. Rollback strategy

1. Set all `rms.cad.*` overrides to false / remove overrides
2. Disable all CAD connections (`DISABLED`)
3. Suspend polling schedules
4. Stop consuming CAD queues (or scale worker with CAD consumers off)
5. Redeploy previous Compute/worker images if needed
6. Leave schema in place (additive migrations); do not drop FORCE RLS
7. Document incident IDs created during failed window for manual review

---

## 13. Deferred / out of scope (Phase 4)

- Phase 5, offline sync, external NERIS submission, state submission, ePCR, AI narrative, IRWIN
- Production CAD vendor onboarding / production customer onboarding
- Active UI for `NOT_IMPLEMENTED` transports (SFTP, file drop, broker, socket gateway, middleware, manual export)
- Claiming SOC 2 certified/compliant/audited

---

## 14. Immediate next step

**PHASE 4A** — after operator acknowledgment of this plan:

1. Scaffold `@forge/cad-contracts` / `@forge/cad-core`
2. Migration `0013_cad_connections` (+ drizzle schema)
3. Seed permissions + feature flags
4. Audit event type constants
5. Status doc update

Do not deploy until an increment is verified locally and the pre-deployment gate is satisfied.
