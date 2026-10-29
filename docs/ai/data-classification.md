# AI Narrative — Data Classification

**Enums:** `AI_DATA_CLASSIFICATIONS` in `@forge/ai-contracts`  
**Platform reference:** [../security/data-classification.md](../security/data-classification.md)

## Levels

| Level        | AI default                                                                                    |
| ------------ | --------------------------------------------------------------------------------------------- |
| PUBLIC       | May be included in prompts                                                                    |
| INTERNAL     | May be included in prompts                                                                    |
| CONFIDENTIAL | Requires tenant model policy allowance; preview may be redacted                               |
| RESTRICTED   | Blocked by default; multi-factor gate (policy + permission + confirmation + business purpose) |

## Source manifest

Each source field carries `classification`, `included`, `redacted`, and optional `valuePreview` (max 500 chars). Excluded and blocked field ids are recorded on the manifest; `sourceHash` fingerprints the authorized set.

## Redaction behavior

`@forge/ai-redaction`:

- Always consider RESTRICTED blocked unless `allowRestricted` is explicitly true after policy gates.
- Pattern-block fields resembling SSN, passwords, tokens, DOB, bank/routing, FEMA SID, driver license, etc.
- Audit summary includes counts and field ids only — never removed values.

## Logging

Never log full source payloads, restricted previews, or complete narrative bodies. Use request ids, classifications, and metric names from `@forge/ai-observability`.
