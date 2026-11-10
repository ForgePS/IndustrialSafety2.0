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

New feature registry keys (`forge_ai.command_center`, `forge_ai.risk_intelligence`, `forge_ai.recommendations`), each a Creator toggle, default off for existing tenants and on for the Cypress Bend demo tenant. Existing `/ai` behaviour stays the same until the flag is on.

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
| 3 Risk intelligence and proactive monitoring | Next |
| 4 Recommendations and approvals | Pending |
| 5 Command Center UI, security suite, docs, completion report | Pending |

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
