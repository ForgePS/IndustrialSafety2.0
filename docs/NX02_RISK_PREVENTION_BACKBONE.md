# NX-02 — Risk Prevention Backbone

**Status:** Hardened (NX-02H atomic lifecycle) on `codex/nx02-risk-prevention-backbone`  
**Depends on:** NX-01 Universal Workflow + Shared Evidence Core  
**Baseline:** `007a7ebb3757c05f5f3abec3e37e0d33485d916b`

## Objective

Production risk-prevention backbone: shared 5×5 risk matrix engine, Observations, Risk Register, and JSA/JHA — each with authoritative relational tables, RLS, Creator forms/lookups, NX-01 workflow definitions, CAPA-grade atomic lifecycle RPCs, and cross-module CAPA/risk/asset links.

## Migrations

| Migration | Purpose |
| --- | --- |
| `20260924360000_forge_risk_prevention_core.sql` | Risk matrix definitions, levels, cells, bands; calculate helpers |
| `20260924361000_forge_observations_runtime.sql` | Observations tables, permissions, forms, numbering |
| `20260924362000_forge_risk_register_runtime.sql` | Risks, assessments, controls, treatments |
| `20260924363000_forge_jsa_runtime.sql` | JSA headers, steps, hazards, controls, executions, revisions |
| `20260924370000_forge_risk_prevention_workflows.sql` | Core workflow seeds |
| `20260924380000_forge_risk_prevention_integrations.sql` | CAPA/source lookups |
| `20260924381000_forge_nx02h_observation_atomic_lifecycle.sql` | `forge_perform_observation_lifecycle_transition` + transactional field update |
| `20260924382000_forge_nx02h_risk_atomic_lifecycle.sql` | Risk atomic RPC, acceptance, reviews, matrix immutability, status model `draft/assessment/review/active/closed` |
| `20260924383000_forge_nx02h_jsa_atomic_lifecycle.sql` | JSA version/activation/execution RPCs, PPE/training, crew ack, stop-work |
| `20260924384000_forge_nx02h_ai_capabilities.sql` | Forge AI tools + `jsa.create_draft` approved action |

## Atomic lifecycle architecture

Observation, Risk, and JSA **must not** use domain-update-then-workflow with best-effort rollback.

Controlled transitions go through security-definer RPCs that atomically update:

- domain lifecycle state + `row_version`
- workflow instance state + workflow event
- activity + creator audit
- idempotency keys
- (risk) approval/acceptance gates where applicable

Forced-failure flags (`p_fail_after_*`) prove full rollback in contract tests.

### Transition RPCs

| Domain | RPC |
| --- | --- |
| Observation | `forge_perform_observation_lifecycle_transition` |
| Observation fields | `forge_update_observation_transactionally` |
| Risk | `forge_perform_risk_lifecycle_transition` |
| Risk review | `forge_create_risk_review` |
| Risk acceptance | `forge_accept_risk` |
| JSA version | `forge_perform_jsa_version_transition` |
| JSA activate | `forge_activate_jsa_revision` |
| JSA execution | `forge_perform_jsa_execution_transition` |

TS adapters: `forgeObservationWorkflowSync.ts`, `forgeRiskWorkflowSync.ts`, `forgeJsaWorkflowSync.ts`.

## Risk approval & acceptance

- Bands with `requires_approval=true` block `activate` unless a completed `forge_approval_requests` row exists for the risk.
- Formal acceptance (`risk_register.accept`) records `accepted_by` / `accepted_at` / `acceptance_comment` via `forge_accept_risk` — separate from workflow approval.
- Immutable review snapshots live in `forge_risk_reviews`.

## JSA activation transaction

`forge_activate_jsa_revision` locks lineage, supersedes prior ACTIVE, activates APPROVED candidate, updates `active_version_id`, writes workflow/activity/audit/idempotency in one TX. Unique partial index enforces one ACTIVE per lineage. Non-draft content mutation is rejected.

## JSA execution

States: `planned → briefing → active → completed`, plus `active → stopped`, and cancel. Crew acknowledgments use NX-01 `forge_record_acknowledgements`. Activation blocks until required acks complete. Stop-work captures actor/time/reason. Training requirements surface WARNING (not block) from Training completions.

## Relationship persistence

`forge_record_links` rows are created for Observation→CAPA/Risk, Risk→CAPA, JSA→CAPA/Risk/Asset via `createRecordLink` + `requireCompatibleForgeResources` (same-tenant).

## Forge AI tools

| Tool | Permission | Notes |
| --- | --- | --- |
| `search_observations` | `observations.view` | Never returns anonymous identity |
| `analyze_observations` | `observations.view` | Scoped aggregates |
| `search_risks` | `risk_register.view` | |
| `explain_risk` | `risk_register.view` | Server-authoritative scores |
| `search_jsas` | `jsa_jha.view` | |
| `draft_jsa` | `jsa_jha.create` | Queues `jsa.create_draft` approved action; DRAFT only |

## Creator configuration

Observations / Risk Register / JSA features, permissions, forms, lookups, and navigation are registered in runtime migrations. Risk statuses updated to NX-02H model. `risk_register.accept` permission granted to company-admin / safety-manager templates.

## Security results (contract)

- Matrix cell mutation on active/used versions: DENY (trigger)
- Cross-tenant id+org filtered reads: empty
- Application links: `requireCompatibleForgeResources` denies foreign targets
- Atomic fail-after: domain + workflow roll back together
- Idempotent transitions: single event

## Tests

| Suite | Command |
| --- | --- |
| Observation atomic | `node apps/web/tests/nx02h-observation-atomic-db.cjs` |
| Risk atomic | `node apps/web/tests/nx02h-risk-atomic-db.cjs` |
| JSA atomic | `node apps/web/tests/nx02h-jsa-atomic-db.cjs` |
| AI capabilities | `node apps/web/tests/nx02h-ai-capabilities-db.cjs` |
| Relationship attacks | `node apps/web/tests/nx02h-relationship-attacks-db.cjs` |
| Foundation NX-02 | `node apps/web/tests/nx02-*-db.cjs` |
| Playwright NX-02H observation | `apps/web/tests/nx02h-observation-lifecycle.spec.cjs` |
| Playwright NX-02H anonymous | `apps/web/tests/nx02h-anonymous-observation.spec.cjs` |
| Playwright NX-02H risk | `apps/web/tests/nx02h-risk-lifecycle.spec.cjs` |
| Playwright NX-02H matrix | `apps/web/tests/nx02h-risk-matrix.spec.cjs` |
| Playwright NX-02H JSA | `apps/web/tests/nx02h-jsa-lifecycle.spec.cjs` |
| Playwright NX-02H template | `apps/web/tests/nx02h-jsa-template.spec.cjs` |
| AI schemas | `node scripts/check-forge-ai-schemas.cjs` |

## Hardening notes (NX-02H)

- JSA hazard authoring captures **initial + residual** likelihood/severity (residual defaults to initial when omitted) so approve gates are enforceable from UI.
- Playwright lifecycle packs run as `admin@forge2.local` (company-owner) for assess/approve/activate; anonymous identity pack uses `user@forge2.local`.
- Login helpers wait for `networkidle` and use Local Demo fill to avoid i18n hydration races on `/auth/login`.

## Known remaining / deferred

- Cross-tenant UI denial via Active company switcher is soft when owner/admin lacks the outside-org membership option (DB cross-tenant contract tests remain authoritative).
- JSA Create Revision may remain on the same record URL while cloning version content; DB revision/activation contracts prove lineage.
- Worker Safety Passport (NX-04) not in scope.
- Incident/Inspection Finding → Risk create paths beyond registry: verify/extend if not already wired in integrations.
