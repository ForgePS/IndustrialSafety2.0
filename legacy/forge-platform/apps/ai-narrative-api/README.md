# AI Narrative API

Shared Forge Platform AI Narrative Assistant service.

## Foundation deployment

- **Packages:** `@forge/ai`, `@forge/ai-contracts`, `@forge/ai-policy`, `@forge/ai-redaction`, `@forge/ai-prompts`, `@forge/ai-evaluation`, `@forge/ai-observability`
- **HTTP routes (v1):** hosted on `platform-api` under `/api/v1/ai/*` so no Phase 4 CAD / ECS surface changes are required yet
- **This app:** health entrypoint and future dedicated compute home
- **Feature flags:** all `ai.narrative.*` default **false** — not enabled for the Phase 4 synthetic tenant

Provider SDKs must not be imported from product modules (RMS / Industrial / Academy). Use `AiNarrativeProvider` via `@forge/ai`.
