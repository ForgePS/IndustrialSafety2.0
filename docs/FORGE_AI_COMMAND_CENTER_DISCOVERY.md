# Forge AI Command Center: Architecture Discovery and Sprint Plan

Status: Phase 1 (repository discovery) complete. Implementation has not started.
Branch: `feat/forge-ai-command-center`, cut from `forge-creator-2.0`.
Companion design doc: [FORGE_AI_ASSISTANT_2_0_ARCHITECTURE.md](FORGE_AI_ASSISTANT_2_0_ARCHITECTURE.md). That doc is the existing design. This one records what is actually built and what the sprint adds.

## 1. Platform architecture (as found)

| Area | What exists | Where |
|---|---|---|
| Frontend | Next.js 15 App Router, React 18, Tailwind 3 + shadcn/Radix (`packages/ui`), react-query, react-table, zod + react-hook-form | `apps/web/src/app/(back)` is the signed-in app; the shell is `(back)/layout.tsx` |
| Navigation | Database-driven: rows in `forge_experience_elements` (`nav.*`, `settings.route_live`, `required_permission`), with tenant and location overrides | `lib/forgeExperience.ts`, `components/layout/vertical/Sidebar.tsx` |
| Backend writes | Server actions (`'use server'`): `requireTenantPermission`, then `createServiceRoleClient`, validate, write, activity row, `revalidatePath`, return `{error}` | e.g. `(back)/incidents/actions.ts` |
| Atomic lifecycle | Postgres RPCs (`forge_perform_*_lifecycle_transition`, `forge_perform_workflow_transition`) | migrations |
| API routes | Only for files, exports and cron | `app/api/**` |
| Database | Supabase Postgres, 71 idempotent migrations `YYYYMMDDHHMMSS_forge_<topic>.sql`; every table is `forge_*` with `organization_id`; pgvector is installed | `apps/web/supabase/migrations` |
| Tenant isolation | `organization_id` on every row. RLS is `is_org_member()` for reads, or service-role only. The app filters by organization on every query | foundation migration, `lib/forgeTenantContext.ts` |
| Facility scope | App-level scopes `own / assigned / location / division / organization`, from `forge_tenant_user_location_access` and `_division_access` | `lib/forgeScope.ts` |
| AuthN | Supabase Auth (password, magic link), cookie SSR client | `packages/auth`, `packages/supabase` |
| AuthZ | `forge_permission_registry`, tenant roles and role permissions with scope, per-user overrides, and Creator platform roles. Resolved by `getEffectiveTenantAccess` | `lib/forgeEffectiveAccess.ts`, `lib/forgeTenantAuth.ts` |
| Feature flags | `forge_feature_registry` (platform state) combined with plan entitlements and tenant overrides | Creator, `/admin/creator/features` |
| Audit | `forge_creator_audit_log` (append-only), plus per-module `forge_*_activity` tables and `forge_workflow_events` | `lib/forgeAudit.ts` |
| Events | `forge_domain_event_outbox` is written by lifecycle RPCs but **has no consumer** | `…nx01h_hardening.sql` |
| Jobs | No pg_cron. Bearer-secret cron endpoints (workers comp, help desk, AI watch) are expected to be called by an **external scheduler that is not configured** | `app/api/*/cron` |
| Notifications | `forge_notification_events` and `_deliveries`, in-app inbox, Resend email adapter | `lib/forgeNotifications.ts` |
| Tests | Playwright `*.spec.cjs` against a production build; Node `*-db.cjs` regressions against local Supabase; schema check `scripts/check-forge-ai-schemas.cjs` | `apps/web/tests`, `.github/workflows` |
| Deploy | Vercel prebuilt via `deploy-demos.yml`; git auto-deploy is off | `vercel.json` |

Operational modules with tenant data the agents can read: incidents, inspections and findings, observations, corrective actions (CAPA), risk register (deterministic matrices), JSAs, LOTO, assets and maintenance, personnel, training/LMS, OSHA cases, workers comp (sensitive), tasks and help desk.

## 2. Existing Forge AI layer

| Directive component | Status today | Evidence |
|---|---|---|
| Provider abstraction | **Missing.** The OpenAI Responses API is called directly with no timeout, retry or fallback. The tenant `provider` column is ignored. Help Desk has a small provider interface | `lib/forgeAiProvider.ts`, `lib/forgeHelpdeskAi.ts` |
| Model config | Partial: tenant model, effort, limits and budget are set in Creator. No model registry | `forge_ai_tenant_settings` |
| Prompt management | **Missing.** Prompts are inline strings | `api/forge-ai/chat/route.ts` |
| Structured output validation | **Missing** for model output. Tool *schemas* are strict, but tool *arguments* are not validated at runtime | `lib/forgeAiTools.ts` |
| Usage tracking | Real for chat and embeddings. Help Desk AI is not logged; cost is never filled in | `forge_ai_usage_events` |
| Conversations and messages | Real (CRUD, pin, archive, feedback). Retention setting is unused | `/ai`, `forge_ai_conversations` |
| Tools | Real: 25 permission- and scope-checked read tools, each logged | `lib/forgeAiTools.ts` |
| Agents and orchestrator | **Missing.** One assistant with tool calling | — |
| Knowledge / RAG | Real pgvector retrieval for tenant text sources. No file parsing, versioning or re-index job | `lib/forgeAiKnowledge.ts` |
| Risk intelligence | Deterministic risk matrix only. **No facility or department risk scoring** | `forge_risks*` |
| Proactive monitoring | Real rule engine (9 rules, dedupe, auto-resolve) and a cron endpoint. **No scheduler, no event trigger, no notifications** | `lib/forgeAiWatch.ts` |
| Approvals | Real for 3 write actions (expiry, permission re-check, audit). **No generic recommendation lifecycle** | `lib/forgeAiActions.ts` |
| Global entry point | **Missing.** There is a `/ai` sidebar item and per-record "Ask Forge" buttons on 8 detail pages | `components/forge-ai` |
| AI tests | Thin: registry and scope DB checks. Nothing for chat, provider, RAG, watch or actions | `tests/nx02h-ai-*`, `nx02r-ai-*` |

**Conclusion:** about 40% of the directive is already built and works against real tenant data. The sprint extends this layer. It does not create a second AI system, second conversation tables or second approval tables.

## 3. Sprint design (extend, don't duplicate)

Reused as-is: `forge_ai_conversations`, `_messages`, `_tool_runs`, `_action_approvals`, `_usage_events`, `_feedback`, `_knowledge_sources`, `_knowledge_chunks`, `_watch_*`, `_capabilities`, `_action_registry`, and the permission and scope resolution.

New additive migration `forge_ai_command_center.sql`:

| New table | Purpose |
|---|---|
| `forge_ai_model_registry` | Allowed provider and model pairs, context limits, per-token cost, enabled state (platform-level) |
| *(no table)* | Prompts are platform code in `lib/forgeAiPrompts.ts`: versioned, hashed, pinned by tests and recorded on every agent run. Tenants add wording through settings and cannot edit the hard rules |
| `forge_ai_agent_runs` | One row per orchestrated request: intent, chosen agent(s), status, step count, latency, error, prompt version |
| `forge_ai_knowledge_source_versions` | Document versions; chunks point at a version; re-index history |
| `forge_ai_risk_models` | Versioned, tenant-configurable scoring weights and thresholds |
| `forge_ai_risk_assessments` | Facility or department score, band, calculation version, period, computed_at |
| `forge_ai_risk_indicators` | Per-factor inputs and evidence (record ids) for each assessment |
| `forge_ai_recommendations` | Lifecycle `proposed → in_review → approved/rejected → executing → executed → verified/failed`; links to evidence, alert, assessment and action approval |
| `forge_ai_recommendation_events` | Append-only audit history of every lifecycle step |
| `forge_ai_alert_routes` | Notification routing per watch rule and severity (role, location, in-app or email) |
| `forge_ai_audit_events` | Unified, append-only AI audit trail (prompt version, agent, tools, decision, actor) |

New columns: `forge_ai_watch_alerts.acknowledged_by` and `notified_at`, plus a link from an alert to its recommendation. Every new table gets `organization_id`, location and department scope where relevant, indexes on `(organization_id, …)`, RLS enabled with service-role grants (matching the existing AI tables), and a retention sweep driven by `data_retention_days`.

### Phase-by-phase scope

| Phase | Work |
|---|---|
| 2 Foundation | `ForgeAiProvider` interface with an OpenAI adapter; timeouts (AbortSignal), bounded retry with backoff on 429/5xx, provider error isolation; zod validation of tool arguments and structured outputs (JSON-schema response format); model registry lookup; prompt templates; usage and cost on every call, including Help Desk |
| 4 Orchestrator | Intent classifier (deterministic keyword and route rules first, model fallback), registry of 8 agents (each = prompt version + tool allowlist + step limit), routing, page/record context, source attribution, response validation, `agent_runs` logging |
| 5 Knowledge | File upload (PDF, DOCX, TXT, MD) with text extraction, versions, re-index, sensitivity-aware search, document text fenced as untrusted data in prompts |
| 6 Risk | Deterministic, versioned scoring over real records (severity, frequency per exposure hours/headcount, hazard recurrence, overdue CAPA, failed findings, 90-day trend) at facility and department level, with stored evidence. Labelled "risk indicator", never a probability |
| 7 Monitoring | New rules (new incident, recurring hazard, overdue CAPA, failed inspection, training deficiency, emerging trend), configurable thresholds, outbox consumer for event-driven runs, alert routing to the existing notification service, dedupe, acknowledgement |
| 8 Recommendations | Lifecycle service plus UI; execution reuses the existing action registry and approval engine (re-checks permission at execution); verification step; full event history |
| 9 Command Center | `/ai` redesign as the Command Center hub; a global assistant button in the header (drawer with page context); risk dashboard; recommendation cards with approve/reject; alert center; activity and usage history |
| 10–11 Security and tests | Cross-tenant and cross-facility tests for every new read path; prompt-injection fixtures; unauthorized-tool and invalid-output tests; provider failure tests; duplicate-alert and approval-workflow tests; Playwright for the Command Center; add the AI suites to CI |
| 12 Docs | Environment configuration, deployment and scheduler setup, architecture update, completion report |

### Rollout

As built, one feature key, `forge_ai_command_center`, gates all of it, rather than the three keys first planned. It requires an entitlement: a tenant gets it from its plan or a Creator override, and it is on for the Cypress Bend demo tenant. Existing `/ai` chat behaviour is unchanged when it is off. See the Stage 5 section for what the flag controls.

## 4. Constraints and open decisions

1. **Live model calls need an OpenAI key.** `.env.local` has none. Without it, everything deterministic (risk, monitoring, recommendations, retrieval plumbing, authorization) can be tested on real seeded data. Model-dependent paths are tested against a local stub provider that runs through the same interface; the completion report will say which paths were verified live.
2. **Scheduler.** No cron runner exists in 2.0. The plan adds a secured endpoint and documents a scheduler (GitHub Actions schedule or AWS EventBridge). Turning it on in a hosted environment is a separate step.
3. **Delivery.** One branch, but split into reviewable PRs against `forge-creator-2.0` (foundation and schema → agents and knowledge → risk and monitoring → recommendations → Command Center UI) so CI and review run per stage.
4. **Scope.** This is 2.0 only. The 1.0 production platform (Forge-Platform) is untouched.

## 5. Progress

| Stage | Status |
|---|---|
| 1 Foundation: provider interface, timeouts and retries, tool allowlisting and argument validation, structured output, prompt versions, agent runs, model registry, unified AI audit, retention, rollout flag | Done on `feat/forge-ai-command-center` |
| 2 Orchestrator, 8 agents, knowledge engine | Done on `feat/forge-ai-agents` |
| 3 Risk intelligence and proactive monitoring | Done on `feat/forge-ai-risk-monitoring` |
| 4 Recommendations and approvals | Done on `feat/forge-ai-recommendations` |
| 5 Command Center UI, security suite, docs, completion report | Done on `feat/forge-ai-command-center-ui` |

Stage 1 tests: `tests/forge-ai-foundation.test.cjs` (19 unit tests), `tests/forge-ai-foundation-db.cjs` (21 database checks, including cross-tenant retention), `tests/forge-ai-pipeline.spec.cjs` (4 end-to-end checks through `/api/forge-ai/chat` with the guarded test provider). All three run in CI.

Stage 2 adds:

- **Orchestrator and agents** (`src/lib/forgeAiAgents.ts`):
  - Eight agents: Knowledge, Incident, Inspection, Compliance, Risk, Reporting, Monitoring and Workflow. Each has a tool allowlist and call limits.
  - A turn is routed by the user's explicit choice, then the record being viewed, then keyword intent. Unclear or mixed questions go to the general assistant.
  - An agent only narrows the tools the user already has. Only the Workflow agent can prepare actions.
  - Each agent has its own versioned prompt, and the route is recorded on the agent run.
- **Answer checks** (`src/lib/forgeAiResponseCheck.ts`):
  - Records that the tools returned and the answer cites are linked as sources.
  - A record reference is flagged in the answer when no tool returned it and the user never typed it.
  - Internal ids are replaced with `[internal id]`.
  - Knowledge and help-article text reaches the model fenced as untrusted data. Text that reads like instructions is flagged and audited.
- **Knowledge engine:**
  - Upload PDF, Word, Markdown or text files (up to 10 MB). Files are typed by content, not by name.
  - Every change is a numbered version with its checksum.
  - Chunks keep page numbers and the version they came from.
  - Retrieval is hybrid: Postgres full-text always, plus embeddings when an embedding key is set, fused by rank. Knowledge search therefore works without an OpenAI key.
  - Sources indexed before can be re-indexed when they fall behind their latest version.
  - Seeded or imported sources become version 1 on first index.
- **Security fix:**
  - `match_forge_ai_knowledge` could be called by anonymous and signed-in clients with any organization id. That exposed other tenants' knowledge, including restricted sources.
  - It and the new full-text search function now run for the service role only.

Stage 2 tests:

| Suite | Coverage |
|---|---|
| `tests/forge-ai-agents.test.cjs` | 19 unit tests: routing, allowlists, limits, prompt pins, answer checks, injection scanning, PDF and DOCX extraction, ranking |
| `tests/forge-ai-agents-knowledge-db.cjs` | 12 database checks: search functions closed to clients, tenant isolation, restricted and draft filtering, lexical-only chunks, capability coverage |
| `tests/forge-ai-agents.spec.cjs` | 8 end-to-end checks: routing and citations, allowlist refusal, unverified references and id redaction, text and PDF upload with versions, restricted filtering, injection flagging and audit, upload refusals and cross-tenant refusal, the workspace agent picker |

All three run in CI.

Stage 3 adds:

- **Risk intelligence** (`src/lib/forgeAiRiskScore.ts`, `src/lib/forgeAiRisk.ts`, `/ai/risk`)
  - Each facility (location) and division gets a 0-100 risk indicator from a versioned model (`forge_ai_risk_models`, platform default `facility_risk` v1).
  - The indicator combines seven factors over the last 90 days:
    - injury rate per 200,000 hours, from OSHA 300A hours;
    - incident severity load;
    - 30-day incident trend;
    - open high or critical findings;
    - overdue corrective actions;
    - share of training assignments overdue;
    - open high-band risks and observations.
  - Each factor is stored with its detail and the records it came from (`forge_ai_risk_indicators`).
  - A factor without data is left out and the rest are re-weighted. It is never counted as zero.
  - A scope gets no score ("Not enough data") in two cases: it has fewer than 5 records, or less than 60% of the model's weight has data.
  - The indicator ranks where attention is needed. It is labelled as an indicator, never as a probability.
  - Viewers need `forge_ai.view_risk`. Location-scoped viewers see only their facilities, and evidence from modules they cannot open is hidden.
- **Monitoring**
  - Eight new Watch rules:
    - serious or injury incident reported;
    - recurring incident type at one location;
    - emerging incident trend against the location's own baseline;
    - failed inspection not closed;
    - open high-risk observation;
    - risk review overdue;
    - training gap at a location;
    - elevated facility risk indicator.
  - Pattern alerts (recurring, trend, training gap) are shown only to people who can open every record behind them.
- **Alert routing** (`forge_ai_alert_routes`, managed on `/ai/watch`)
  - A route sends alerts at or above a severity, for one rule or all rules, to a tenant role or a person, in the app or by email.
  - Delivery goes through the shared notification service.
  - A recipient only receives alerts they could open in AI Watch.
  - Each alert is notified once, and again only if it reopens.
  - With no routes set up, company owners and administrators receive high and critical alerts in the app.
- **Event-driven runs**
  - Submitting an incident now publishes `incident.submitted` to the domain event outbox.
  - The scheduler's events mode runs a cycle for each tenant with new events since its cursor (`forge_ai_watch_cursors`). It does not consume or mark events, so other outbox consumers are unaffected.

### Scheduler

`/api/forge-ai/watch/cron` requires `Authorization: Bearer $FORGE_AI_CRON_SECRET`. Without the secret set, it refuses every call. It has two modes:

| Call | What it does | Suggested schedule |
|---|---|---|
| `POST /api/forge-ai/watch/cron` | Full cycle for every entitled tenant: risk indicators, every Watch rule, recommendations and their verification, then notifications | Daily |
| `POST /api/forge-ai/watch/cron?mode=events` | A cycle only for tenants with new domain events | Every 5–15 minutes |

No hosted scheduler is configured yet. Point a Vercel cron, GitHub Actions schedule or AWS EventBridge rule at these URLs once the 2.0 deployment exists.

Stage 3 tests:

| Suite | Coverage |
|---|---|
| `tests/forge-ai-risk-monitoring.test.cjs` | 14 unit tests: scoring, re-weighting, insufficient data, bands, evidence caps, injury rate and trend maths, recurring/trend/training-gap detection, routing thresholds, agent tool allowlist |
| `tests/forge-ai-risk-monitoring-db.cjs` | 23 database checks: new tables closed to clients, model, rules, permission and capability registered, incident outbox trigger, route constraints |
| `tests/forge-ai-risk-monitoring.spec.cjs` | 7 end-to-end checks covering: <ul><li>scheduler auth;</li><li>scoring on the seeded plant, including an empty site left unscored;</li><li>new-rule alerts and notification dedupe;</li><li>an event-driven run after an incident is submitted, with a route to a role that cannot see alerts receiving nothing;</li><li>the Risk Indicators page for permitted, unpermitted and other-tenant users;</li><li>the risk agent tool;</li><li>acknowledging an alert.</li></ul> |

All three run in CI.

Stage 4 adds:

- **Recommendations** (`src/lib/forgeAiRecommendationRules.ts`, `src/lib/forgeAiRecommendations.ts`, `/ai/recommendations`)
  - Built on each monitoring cycle, or with Refresh Recommendations, from two sources only:
    - open Watch alerts whose rule has a mapping (failed inspection, serious or recurring incidents, high-risk observation, critical or overdue findings, training gap, overdue risk or LOTO review, asset condition);
    - the top three factors driving an Elevated or High risk indicator, when a factor is at least half way to saturation.
  - Each one keeps its rationale (the alert summary, or the score and the factor's own detail), the records behind it, its source alert or assessment, and how it will be verified.
  - Kinds: corrective action, review, training, maintenance, escalation. Priority comes from the alert severity or the risk band.
  - Only one live recommendation exists per condition. A dismissed or rejected one is not proposed again for 30 days. A proposal nobody acted on is marked cleared when its condition goes away.
- **Lifecycle** (`forge_ai_recommendations`, with every change in the append-only `forge_ai_recommendation_events`)
  - proposed → in review (action queued) → executing → executed → verified, or rejected, failed, dismissed or cleared.
  - Advisory recommendations (no proposed action) are accepted, then marked done by a person with a note.
  - A proposed action never runs directly. It is queued in the existing approval engine (`forge_ai_action_approvals`) and shows in Forge AI Actions too. Approval re-checks the requester's and the approver's module permission and location scope at execution.
  - A database trigger moves the recommendation with its approval (executing, executed, failed, rejected; an expired approval returns it to proposed), so approving from either page gives the same result.
- **New approved action:** `corrective_action.create` creates an open corrective action and its linked task through the Corrective Actions module, as the approver. It never assigns, completes or verifies one. Requests from recommendations wait 7 days for approval.
- **Verification**
  - Checked automatically on each cycle against the same facts: the corrective action is verified or closed (and not found ineffective), the source alert has resolved, or the factor's value fell on a recalculation after the work was done.
  - All checks met → verified. A corrective action verified as ineffective → failed. Otherwise it waits, and is flagged once 14 days pass.
  - A reviewer can confirm a result as effective or not effective, with a note. The automatic checks are kept beside it.
- **Access**
  - `forge_ai.view_recommendations` to see them; `forge_ai.review_recommendations` to accept, dismiss, mark done and verify. Sending an action for approval also needs `forge_ai.run_actions`, and approving or rejecting it needs `forge_ai.approve_actions`, as in the action queue.
  - A viewer sees a recommendation only when their scope covers its location or division and they can see its source alert in AI Watch or its scope in Risk Indicators. Evidence from modules they cannot open is hidden.
  - Supervisors and location administrators get both permissions at location scope; owners and administrators at organization scope.
- **Agent tool:** `get_recommendations` (read-only) for the Risk, Monitoring and Reporting agents. "Recommend" routes to the Monitoring agent.

Stage 4 tests:

| Suite | Coverage |
|---|---|
| `tests/forge-ai-recommendations.test.cjs` | 15 unit tests: alert and factor mappings, evidence and rationale, thresholds and the top-three limit, division targeting, duplicate and cool-down rules, every verification check, agent allowlist and routing |
| `tests/forge-ai-recommendations-db.cjs` | 25 database checks: tables and functions closed to clients, permissions, tool, action and tenant enablement registered, the approval trigger for each status, append-only history, one live recommendation per condition |
| `tests/forge-ai-recommendations.spec.cjs` | 8 end-to-end checks covering: <ul><li>generation from the seeded alerts and Main Plant's elevated indicator, with no duplicates on a second run;</li><li>sending a corrective action for approval, approving it and the record it creates;</li><li>automatic verification only once the corrective action and alert show it worked;</li><li>an advisory recommendation accepted, done and verified by a person;</li><li>dismiss with a reason and no immediate return;</li><li>a rejected action;</li><li>the monitoring agent tool;</li><li>access for unpermitted and other-tenant users.</li></ul> |

All three run in CI.

Stage 5 adds:

- **Command Center** (`/ai/command-center`)
  - Tiles:
    - open high and critical alerts;
    - facilities and divisions at Elevated or High;
    - recommendations to review;
    - recommendations awaiting verification;
    - AI actions pending approval, shown only with `forge_ai.approve_actions`.
  - An alert center: high and critical Watch alerts, acknowledged through the normal Watch action.
  - The five highest risk indicators.
  - The newest open recommendations, with the same approve, reject and follow-up controls as the full page.
  - The user's own recent assistant activity: agent, status, tool calls and time.
  - A 30-day tenant usage summary, shown only with `forge_ai.view_usage`.
  - Every section reads through the same scoped helper as its own page, so it never shows more than those pages do.
  - Linked first in the Forge AI sidebar.
- **Header assistant** (`src/components/forge-ai/ForgeAiGlobalAssistant.tsx`)
  - A Forge AI button in the header on every page, also opened with Ctrl+J (Cmd+J on a Mac).
  - On a record page (incident, inspection, asset, person, training course, QR code, LOTO procedure, task) it sends that record as context, and the server re-checks access before loading it.
  - Elsewhere it offers prompts for the area the user is in.
  - Hidden on `/ai`, which already is the assistant. Hidden for users without `forge_ai.use`, and when the tenant has switched the assistant off.
  - The record-page Ask Forge AI button and the header use one shared chat panel (`ForgeAiAssistantPanel.tsx`).
- **Rollout flag** (migration `20261109140000_forge_ai_command_center_rollout.sql`)
  - `forge_ai.view_risk`, `forge_ai.view_recommendations` and `forge_ai.review_recommendations` now belong to the `forge_ai_command_center` feature. Without it they resolve as unavailable, so their pages, agent tools and actions are refused by the normal permission checks.
  - The Command Center, Risk Indicators and Recommendations pages also redirect when the feature is off.
  - The monitoring cycle skips risk scoring, recommendation generation and verification for that tenant. Watch rules still run, because AI Watch belongs to the base `forge_ai` feature. The scheduler output reports `commandCenter` per tenant.

### Environment configuration

All server-only. None may carry a `NEXT_PUBLIC_` prefix.

| Variable | Required | Purpose |
|---|---|---|
| `OPENAI_API_KEY` | For live answers | The model provider key. Without it, chat returns a configuration error; deterministic features (Watch, risk, recommendations, approvals) still work |
| `FORGE_AI_MODEL` | No | Default model when the tenant and model registry name none |
| `FORGE_AI_EMBEDDING_MODEL` | No | Knowledge embeddings. Defaults to `text-embedding-3-small` |
| `FORGE_AI_CRON_SECRET` | For the scheduler | Bearer secret for `/api/forge-ai/watch/cron`. Without it the endpoint refuses every call |
| `FORGE_AI_TEST_PROVIDER`, `FORGE_AI_PROVIDER_OVERRIDE` | Tests only | The scripted test provider used in CI. It is refused when `VERCEL_ENV` or `FORGE_DEPLOY_ENV` is `production`. Never set these in a hosted environment |

### Deployment

1. Apply the migrations in order: `20261109100000` to `20261109140000`.
2. Set the variables above. Use a long random `FORGE_AI_CRON_SECRET`.
3. In Creator, give the `forge_ai` and `forge_ai_command_center` features to the tenants that should have them. Existing tenants get nothing new until then.
4. Schedule the two cron calls (see Scheduler above), for example with Vercel cron, a GitHub Actions schedule or an AWS EventBridge rule sending the bearer header.
5. Check one tenant end to end: the Command Center loads, the daily call returns `success: true` for it, and a test question in the header assistant gets a cited answer.

Stage 5 tests:

| Suite | Coverage |
|---|---|
| `tests/forge-ai-command-center.test.cjs` | 3 unit tests: record context for each record page, non-record and malformed paths, area prompts |
| `tests/forge-ai-security-db.cjs` | Every `forge_ai` table and function, found from the catalog so new ones are covered automatically: RLS on with no client policies; anon and a signed-in owner cannot read, insert, update or delete; no function callable by clients; the service role still reads |
| `tests/forge-ai-security.spec.cjs` | 4 end-to-end checks covering: <ul><li>a location supervisor sees an alert at their facility on the Command Center and through the agent, and loses it once it belongs to another facility, while the owner keeps it;</li><li>approvals and usage hidden without their permissions;</li><li>acknowledging from the alert center;</li><li>the feature turned off: pages closed, agent tool refused, risk and recommendations skipped by the cycle, then restored;</li><li>the header assistant opening by click and Ctrl+J, carrying an asset as context, and hidden on `/ai`;</li><li>a member without `forge_ai.use` getting neither the assistant nor the Command Center.</li></ul> |

All three run in CI. The completion report is `docs/FORGE_AI_COMMAND_CENTER_COMPLETION_REPORT.md`.
