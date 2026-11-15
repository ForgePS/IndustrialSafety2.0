# AI Narrative — Cost Controls

**Status:** Foundation (stub provider reports zero cost)

## Quotas (tenant narrative policy)

| Control               | Default                     |
| --------------------- | --------------------------- |
| Monthly request quota | 100                         |
| Daily user quota      | 20                          |
| Per-record limit      | 10                          |
| Cost ceiling (USD)    | optional (`costCeilingUsd`) |

Exceeded quotas fail closed and emit `AiNarrativeQuotaExceeded`.

## Model limits

`ai_model_policies` caps `maxInputTokens` (default 8000) and `maxOutputTokens` (default 2000). Provider requests also cap output tokens (max 8000 in schema; default 2000) and temperature (default 0.2).

## Observability

`@forge/ai-observability` metrics:

- `AiNarrativeRequests` / `Success` / `Failure` / `Latency`
- `AiNarrativeEstimatedCost`
- `AiNarrativeQuotaExceeded`
- `AiNarrativeProviderTimeout`

Usage API: `GET /api/v1/ai/usage` (`ai.narrative.view_usage` or `platform.ai.usage.view`).

## Feature gating

Keeping `ai.narrative.enabled` false prevents spend. Stub provider is the only registered path in this foundation; production provider spend requires Phase 5 authorization and non-stub registration.
