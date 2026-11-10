# Forge AI Command Center: Completion Report

Scope: Forge Industrial Safety 2.0 only. The 1.0 production platform was not changed.

Design, per-stage detail and setup: [FORGE_AI_COMMAND_CENTER_DISCOVERY.md](FORGE_AI_COMMAND_CENTER_DISCOVERY.md).

## What was delivered

The work landed in five stacked pull requests. Each stage extends the existing Forge AI layer rather than adding parallel entities.

| Stage | Branch | Delivered |
|---|---|---|
| 1 Foundation | `feat/forge-ai-command-center` | Provider interface and OpenAI adapter, timeouts and bounded retries, tool allowlisting and argument validation, structured output, versioned prompts, agent runs, model registry, unified AI audit, retention, rollout flag |
| 2 Agents and knowledge | `feat/forge-ai-agents` | Orchestrator and 8 agents, answer checks (citations, unverified references, id redaction, injection flagging), knowledge upload with versions and hybrid retrieval, a fix closing `match_forge_ai_knowledge` to clients |
| 3 Risk and monitoring | `feat/forge-ai-risk-monitoring` | Deterministic, versioned facility and division risk indicators with stored evidence, 8 new Watch rules, alert routing, event-driven runs, the secured scheduler endpoint |
| 4 Recommendations | `feat/forge-ai-recommendations` | Recommendations from alerts and risk factors, a lifecycle with an append-only history, execution only through the existing approval engine, the `corrective_action.create` action, automatic and manual verification |
| 5 Command Center | `feat/forge-ai-command-center-ui` | The `/ai/command-center` hub, the header assistant with page context, the `forge_ai_command_center` rollout flag enforced in permissions, pages and the scheduler, the security suites, and these docs |

## Guarantees and how they are enforced

| Guarantee | Enforcement |
|---|---|
| Tenant isolation | Every read is scoped to the active organization on the server. All `forge_ai` tables have RLS on with no client policies, and every `forge_ai` function is service-role only. `tests/forge-ai-security-db.cjs` checks this against the live catalog, so new tables are covered automatically |
| Facility and division scope | Alerts, risk indicators and recommendations are filtered by the viewer's location and division assignments. Evidence is shown only for records in the viewer's own scoped list for that module, and reviewing a recommendation needs its location inside the review permission's own scope. The Command Center reuses the same helpers as the individual pages |
| No invented data | Risk indicators, alerts, recommendations and verification are deterministic over stored records, and each keeps its evidence. Scopes without enough data are not scored. Indicators are labelled as rankings, never as probabilities. The answer check flags record references that no tool returned |
| Human approval | Nothing an agent or recommendation proposes changes a record directly. Actions queue in `forge_ai_action_approvals`, and permission and scope are re-checked when they execute |
| Rollout control | `forge_ai` gates the assistant; `forge_ai_command_center` gates risk, recommendations and the Command Center, through the feature registry and tenant entitlements |

## Verification

### Automated suites

All of these pass locally on a fresh `supabase db reset`, and all run in CI (`.github/workflows/customer-support-validation.yml`).

| Stage | Unit (`node --test`) | Database | Browser and API (Playwright) |
|---|---|---|---|
| 1 | `forge-ai-foundation.test.cjs` (19) | `forge-ai-foundation-db.cjs` (21) | `forge-ai-pipeline.spec.cjs` (4) |
| 2 | `forge-ai-agents.test.cjs` (19) | `forge-ai-agents-knowledge-db.cjs` (12) | `forge-ai-agents.spec.cjs` (8) |
| 3 | `forge-ai-risk-monitoring.test.cjs` (14) | `forge-ai-risk-monitoring-db.cjs` (23) | `forge-ai-risk-monitoring.spec.cjs` (7) |
| 4 | `forge-ai-recommendations.test.cjs` (15) | `forge-ai-recommendations-db.cjs` (25) | `forge-ai-recommendations.spec.cjs` (8) |
| 5 | `forge-ai-command-center.test.cjs` (3) | `forge-ai-security-db.cjs` (catalog-driven, 288 checks locally) | `forge-ai-security.spec.cjs` (5) |

### Live model vs test provider

No OpenAI key was configured in the development environment, so **no path was verified against a live model**.

- **Verified on real seeded data, without a model:**
  - risk scoring;
  - Watch rules, routing and notifications;
  - recommendations, approvals, execution and verification;
  - knowledge full-text retrieval;
  - all authorization, scope and rollout checks;
  - the scheduler.
- **Verified only through the guarded test provider** (the same provider interface, scripted tool calls):
  - agent routing and tool use;
  - answer checks and citations;
  - structured output validation;
  - provider failure handling;
  - the header assistant's chat.
- **Not verified:**
  - answer quality from a real model;
  - embedding-based retrieval, which needs an embedding key;
  - OpenAI rate-limit and timeout behaviour against the real service.

Before relying on the model paths, run a short live check with a key set: one question per agent, one knowledge question with an uploaded document, and one prepared action.

## Not done, and known issues

- **No hosted scheduler.** The cron endpoint is ready, but nothing calls it outside tests. See Deployment in the discovery doc.
- **No hosted 2.0 deployment** has these migrations applied yet.
- **A Command Center page that is turned off** redirects to `/ai` when the user holds the permission, and to the dashboard through the standard permission check otherwise. Both close the page; the destination differs.
- **`corrective-actions-smoke.spec.cjs` fails on its tenant-switch step.** This predates this work: it expects an organization that is not in the seed.
- **Security-definer functions outside Forge AI** that anonymous clients can call were found during this work. They are tracked separately and were not changed here.
