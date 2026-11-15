# AI Narrative Assistant — Security

**Status:** Foundation; feature flags off  
**Phase 5:** NOT AUTHORIZED

## Controls summary

| Control           | Behavior                                                         |
| ----------------- | ---------------------------------------------------------------- |
| Feature flags     | All `ai.narrative.*` default false                               |
| Permissions       | Fine-grained `ai.narrative.*` and product-scoped codes           |
| Tenant isolation  | Requests scoped by `tenantId`; RLS on AI tables                  |
| Provider boundary | Product code never imports provider SDKs                         |
| Sensitive data    | Redacted/blocked before provider invocation                      |
| Human review      | Required; no auto-finalize, NERIS, or ePCR                       |
| Audit             | Request lifecycle actions recorded without raw restricted values |

## Authorization

Permissions live in `@forge/ai-contracts` (`AI_NARRATIVE_PERMISSIONS`, product and platform sets). Notable codes:

- `ai.narrative.use` / `generate` / `rewrite` / `accept` / `reject`
- `ai.narrative.use_sensitive_data` — required for restricted-path authorization
- `platform.ai.policy.manage` / `platform.ai.usage.view` / `platform.ai.narrative.manage`

RMS/Industrial/Academy have additional product-scoped generate/accept permissions.

## Data path

1. Classification gate (`@forge/ai-policy`) — PUBLIC/INTERNAL allowed; CONFIDENTIAL needs tenant policy; RESTRICTED fail-closed unless permission, confirmation, and business purpose.
2. Redaction (`@forge/ai-redaction`) — blocks SSN-like, credential, and restricted fields by default.
3. Provider receives only included, non-redacted field previews.
4. Logs and metrics never include full narrative bodies or source payloads (`@forge/ai-observability`).

## Provider posture

Foundation ships a **stub provider only**. Production Bedrock/OpenAI (or other) adapters are out of scope until Phase 5 authorization. Stub output is labeled as draft and not for production use.

## Threat model

See [threat-model.md](../security/threat-model.md) for AI-specific threats and mitigations.

## Related

- [privacy.md](./privacy.md)
- [data-classification.md](./data-classification.md)
- [../security/sensitive-data.md](../security/sensitive-data.md)
- [../security/data-classification.md](../security/data-classification.md)
