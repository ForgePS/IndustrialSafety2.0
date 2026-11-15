# AI Narrative — Incident Response

**Scope:** Security, privacy, or availability incidents involving AI Narrative Assistant  
**Phase 5:** NOT AUTHORIZED — foundation remains flag-gated

## Immediate containment

1. Disable master flag `ai.narrative.enabled` (and product flags) for affected tenants or globally.
2. Disable provider configurations (`ai_provider_configurations.status = DISABLED`).
3. If a production provider were live, rotate credentials via Secrets Manager (use `aws-secrets-manager` skill / `asm-exec`; do not pull secret values into chat).
4. Preserve audit rows and request ids; do not delete evidence.

## Classification of incidents

| Class         | Examples                                                           |
| ------------- | ------------------------------------------------------------------ |
| Data exposure | Restricted field reached a provider; narrative logged in cleartext |
| Integrity     | Hallucinated content accepted without review; policy bypass        |
| Availability  | Provider outage, quota exhaustion storms, latency SLOs breached    |
| Abuse         | Prompt injection attempting to exfiltrate other-tenant data        |

## Investigation checklist

- Correlation id → request → draft → audit actions (`AiNarrative*`).
- Source manifest: which fields were `included` / `redacted` / blocked.
- Classification gate and permission decisions.
- Provider key, model id, token/cost metrics (no body replay into tickets).
- Feature-flag and entitlement state at time of event.

## Communication

- Prefer request/draft UUIDs and field ids in tickets — never paste restricted source values or full PHI/PII narratives into Slack/email.
- Product owner authorization required before re-enabling flags.

## Recovery

1. Patch policy/redaction/evaluation as needed; add regression tests.
2. Re-enable stub-only in non-production first.
3. Production provider re-enable only after Phase 5 authorization and documented change control.

## Related

- [security.md](./security.md)
- [../security/threat-model.md](../security/threat-model.md)
- [../compliance/soc2/incidents/README.md](../compliance/soc2/incidents/README.md)
