# AI Narrative Assistant — Architecture

**Status:** Foundation implemented; disabled by default  
**Migration:** `0020_ai_narrative_foundation.sql`  
**Phase 5:** NOT AUTHORIZED

## Purpose

Shared drafting aid for narrative text across RMS, Industrial, and Academy. The assistant never finalizes records, submits NERIS, or submits ePCR. Human review is mandatory.

## Package layout

| Package                   | Role                                                          |
| ------------------------- | ------------------------------------------------------------- |
| `@forge/ai-contracts`     | Schemas, enums, permissions, provider interface               |
| `@forge/ai-policy`        | Classification gates, anti-hallucination rules, user warning  |
| `@forge/ai-redaction`     | Source-field blocking and redaction before provider calls     |
| `@forge/ai-prompts`       | System/user prompt construction                               |
| `@forge/ai-evaluation`    | Deterministic response validation (schema + claim heuristics) |
| `@forge/ai`               | Provider registry and stub provider                           |
| `@forge/ai-observability` | Safe metrics and structured logging helpers                   |

Product modules must not import provider SDKs. They call HTTP APIs or use `@forge/ai` through policy-selected providers.

## Runtime surfaces

| Surface                 | Role                                             |
| ----------------------- | ------------------------------------------------ |
| `apps/platform-api`     | HTTP routes under `/api/v1/ai/*`                 |
| `apps/ai-narrative-api` | Health entrypoint; future dedicated compute home |

Routes are hosted on `platform-api` so Phase 4 CAD/ECS surfaces are unchanged.

## Request flow

1. Caller authenticates; permission and feature-flag checks run (`ai.narrative.*` default **false**).
2. Source manifest is built from authorized record fields; classification gates apply.
3. `@forge/ai-redaction` blocks or masks sensitive fields.
4. `@forge/ai-prompts` builds prompts; `@forge/ai` selects a provider (stub only in this foundation).
5. `@forge/ai-evaluation` validates structured output.
6. Draft is stored as `READY_FOR_REVIEW`. Accept / partial-accept / reject require human action.

## Feature flags

All `ai.narrative.*` flags default **false**, including master enable and product toggles (RMS, Industrial, Academy). Not enabled for the Phase 4 synthetic tenant.

## Data store

Migration `0020_ai_narrative_foundation.sql` adds provider configurations, model/narrative policies, templates, requests, drafts, usage, and audit-oriented tables. Schema: `packages/database/src/schema/ai-narrative.ts`.

## Related docs

- [provider-abstraction.md](./provider-abstraction.md)
- [narrative-policy.md](./narrative-policy.md)
- [human-review.md](./human-review.md)
- [security.md](./security.md)
- [OpenAPI](../api/ai-narrative-openapi.yaml)
