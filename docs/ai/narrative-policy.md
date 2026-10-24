# AI Narrative — Policy

**Packages:** `@forge/ai-policy`, tenant rows in `ai_narrative_policies` / `ai_model_policies`

## Hard rules (prompts)

Anti-hallucination rules are embedded in every system prompt:

- Use only supplied facts; do not infer names, measurements, causes, outcomes, or actions.
- Mark missing information; identify conflicts; preserve uncertainty.
- Distinguish observed facts from reported statements.
- Do not make fire-cause determinations, medical diagnoses, legal conclusions, or assign blame.

The assistant never approves, finalizes, submits to NERIS, or submits ePCR.

## Classification gate

| Classification    | Default                                                                                                                     |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------- |
| PUBLIC / INTERNAL | Allowed                                                                                                                     |
| CONFIDENTIAL      | Requires tenant model policy `allowConfidential`                                                                            |
| RESTRICTED        | Blocked unless tenant allows, caller has `ai.narrative.use_sensitive_data`, `authorizeSensitiveData`, and `businessPurpose` |

## Tenant narrative policy defaults

| Setting                | Default  |
| ---------------------- | -------- |
| Status                 | DISABLED |
| Require accepted terms | true     |
| Monthly request quota  | 100      |
| Daily user quota       | 20       |
| Per-record limit       | 10       |
| Cost ceiling           | optional |

## Feature flags

Master and capability flags (`ai.narrative.enabled`, product toggles, rewrite, quality check, voice, sensitive data, analytics) all default **false**.

## Entitlements

Module code `AI_NARRATIVE`. Product entitlements (`RMS_AI_NARRATIVE`, `INDUSTRIAL_AI_NARRATIVE`, `ACADEMY_AI_NARRATIVE`) are not auto-granted.

## Policy API

`GET /api/v1/ai/policies` lists policies for authorized callers. `PATCH` is reserved (fail-closed) until product-owner authorization.
