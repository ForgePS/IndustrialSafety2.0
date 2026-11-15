# AI Narrative — Provider Abstraction

**Package:** `@forge/ai` + `@forge/ai-contracts`  
**Foundation provider:** stub only

## Rule

Product modules (RMS, Industrial, Academy) **must not** import Bedrock, OpenAI, or other provider SDKs. All generation goes through `AiNarrativeProvider` selected by `@forge/ai` / tenant model policy.

## Interface

`AiNarrativeProvider` (`@forge/ai-contracts`):

- `providerKey: string`
- `generateNarrative(request): Promise<AiNarrativeProviderResponse>`

Request includes system/user prompts, source manifest, token limits, temperature, and correlation id. Response includes provider/model ids, raw text, optional structured payload, token/cost/latency metrics.

## Registry

`AiNarrativeProviderRegistry`:

- `register` / `get` / `list`
- `select(context)` — uses explicit `providerKey` from approved model policy; fail closed if none
- Stub selected only when `ai.narrative.stub_provider` is true (dev/test)

## Stub provider

`StubAiNarrativeProvider` (`providerKey: stub`) returns synthetic structured JSON with draft labeling and zero cost. Not for production.

## Configuration store

`ai_provider_configurations` and `ai_model_policies` (migration `0020`) hold provider status, secret ARN references, model limits, and confidential/restricted allowances. Default status is disabled/draft.

## Future adapters

When Phase 5 is authorized, register adapters behind the same interface. Do not bypass redaction, evaluation, or human-review gates in adapter code.
