# Data Classification

**Status:** Platform standard for Forge data handling  
**AI-specific application:** [../ai/data-classification.md](../ai/data-classification.md)

## Levels

| Level        | Definition                                              | Examples                                                              |
| ------------ | ------------------------------------------------------- | --------------------------------------------------------------------- |
| PUBLIC       | Intended for unrestricted disclosure                    | Published marketing copy, public FOIA-cleared summaries               |
| INTERNAL     | Business data not for public release                    | Tenant configuration, non-sensitive operational metadata              |
| CONFIDENTIAL | Harmful if disclosed; limited need-to-know              | Incident narratives, investigation notes, contact details             |
| RESTRICTED   | Regulated or high-impact identity/financial/health data | SSN, bank/routing, full DOB, credentials, certain medical identifiers |

## Handling rules

1. Store RESTRICTED attributes per [sensitive-data.md](./sensitive-data.md) (dedicated encryption paths).
2. Never place RESTRICTED or CONFIDENTIAL plaintext in logs, metrics, or domain event payloads.
3. Prefer identifiers and field references in audit metadata.
4. Cross-tenant access is forbidden regardless of classification.

## AI Narrative mapping

- Source manifests label each field with one of the four levels.
- PUBLIC/INTERNAL may flow to prompts when the feature is enabled.
- CONFIDENTIAL requires tenant AI model policy allowance.
- RESTRICTED is blocked unless multi-factor authorization succeeds (policy, permission, confirmation, business purpose), and redaction still applies by default.

## Related

- [encryption-design.md](./encryption-design.md)
- [tenant-isolation.md](./tenant-isolation.md)
- [audit-logging.md](./audit-logging.md)
- [../ai/privacy.md](../ai/privacy.md)
