# AI Narrative Foundation — Summary

**Date:** 2026-07-27  
**Status:** FOUNDATION COMPLETE — DISABLED BY DEFAULT  
**Environment:** development (synthetic only)  
**Phase 5:** NOT AUTHORIZED

## Recommendation

**Do not enable** for production or the accepted Phase 4 synthetic tenant until product-owner authorization covers provider selection, tenant terms, quotas, and restricted-data policy. Recommend a dedicated enablement ticket after security review of Secrets Manager credential wiring and Bedrock (or approved) provider adapter.

## What shipped

### Shared packages

| Package                   | Role                                                                    |
| ------------------------- | ----------------------------------------------------------------------- |
| `@forge/ai-contracts`     | Flags, entitlements, permissions, Zod schemas, provider interface       |
| `@forge/ai-policy`        | Classification gate + anti-hallucination rules                          |
| `@forge/ai-redaction`     | Pre-provider redaction (never logs removed values)                      |
| `@forge/ai-prompts`       | Versioned prompt builder                                                |
| `@forge/ai-evaluation`    | Deterministic schema / unsupported-claim validation                     |
| `@forge/ai`               | Provider registry, stub provider, source assembler, generation pipeline |
| `@forge/ai-observability` | Metric names + safe emit helpers                                        |

### Service surface

- `apps/ai-narrative-api` — health entrypoint; dedicated ECS deferred
- `apps/platform-api` `AiNarrativeModule` — versioned routes under `/api/v1/ai/*`
- Creator Console **AI Management** nav + stub pages
- RMS Narrative section: `AiNarrativeAssistantPanel` (hidden unless flags true)

### Database

- Migration: `packages/database/drizzle/0020_ai_narrative_foundation.sql`
- Tables: requests, sources, drafts, revisions, feedback, templates, template_versions, policies, usage, audit_events, provider_configurations, model_policies
- RLS lists updated for tenant isolation

### Feature flags (all default **false**)

`ai.narrative.enabled`, `.rms`, `.industrial`, `.academy`, `.rewrite`, `.quality_check`, `.voice_input`, `.sensitive_data`, `.analytics`

**Not enabled** for Phase 4 synthetic tenant.

### Entitlements / modules

- Module code `AI_NARRATIVE` on RMS / Industrial / Academy starter templates (not auto-entitled)
- Entitlement codes: `RMS_AI_NARRATIVE`, `INDUSTRIAL_AI_NARRATIVE`, `ACADEMY_AI_NARRATIVE`

## Test results

| Suite                                       | Result                                                                                                                                                   |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@forge/ai-policy` unit                     | PASS (2)                                                                                                                                                 |
| `@forge/ai-redaction` unit                  | PASS (1)                                                                                                                                                 |
| `@forge/ai-evaluation` unit                 | PASS (2)                                                                                                                                                 |
| `@forge/ai` unit (pipeline, assemble, lock) | PASS (4)                                                                                                                                                 |
| `@forge/platform-api` typecheck             | PASS                                                                                                                                                     |
| `@forge/ai-narrative-api` typecheck         | PASS                                                                                                                                                     |
| `@forge/contracts` typecheck                | PASS                                                                                                                                                     |
| Full Phase 2/3/4 Playwright regression      | **Not re-run in this session** — no Phase 4 CAD code paths modified; AI panel is flag-gated off. Re-run `@phase4` + chromium before enablement deploy.   |
| Full AI E2E generate→accept→finalize matrix | **Deferred** until flags + policy + provider activated on a non-Phase-4 synthetic tenant. Foundation smoke spec added: `ai-narrative-foundation.spec.ts` |

## Security findings

- Provider credentials: **not** in source; stub provider only; Secrets Manager path documented for real providers
- Restricted data blocked by default; redaction audit stores field IDs only
- Human acceptance required; drafts labeled `AI DRAFT — NOT REVIEWED` until accept
- Finalized / locked incidents rejected for AI mutation
- No NERIS submit, ePCR, or auto-finalize paths added
- App database secret **not** rotated

## Cost controls

- Monthly tenant quota, daily user quota, per-record limit enforced in service when policy is ACTIVE
- Usage rows record tokens / estimated cost / latency
- Automatic reject with `RATE_LIMITED` when exceeded

## Infrastructure changes

- None required for foundation (routes mount on existing platform-api)
- Dedicated `ai-narrative-api` ECS / CloudFront path deferred
- Migration `0020` must be applied to development Aurora before enabling flags

## Known limitations

1. Stub provider only — no Bedrock/OpenAI adapter yet
2. Template publish / policy PATCH / Creator Console mutations are fail-closed stubs
3. Source assembler for RMS covers core incident fields; full category matrix expands with enablement
4. Full §17 E2E matrix awaits authorized enablement tenant
5. CloudWatch alarms for AI metrics not yet provisioned in CDK

## Deployment status

- Code foundation in repo
- Feature remains **disabled**
- Do not deploy enablement overrides to production
- Do not modify accepted Phase 4 CAD functionality

## Rollback

1. Ensure all `ai.narrative.*` overrides remain false / delete any accidental overrides
2. Optionally unregister `AiNarrativeModule` from `app.module.ts` and redeploy platform-api
3. Migration `0020` is additive; tables can remain unused (no drop required for rollback of feature)

## Documentation

See `/docs/ai/*`, `/docs/api/ai-narrative-openapi.yaml`, `/docs/user-guides/ai-narrative-assistant.md`, `/docs/security/threat-model.md`, `/docs/security/data-classification.md`.
