# AI Narrative Assistant — Privacy

**Status:** Foundation; not enabled for Phase 4 synthetic tenant  
**Phase 5:** NOT AUTHORIZED

## Principles

1. AI drafts are assistive only. Humans own record content.
2. Minimize data sent to any model: exclude by category, redact sensitive fields, prefer field references over raw identifiers.
3. Restricted data requires explicit permission, per-request confirmation, and a documented business purpose.
4. Do not use AI narrative traffic for model training or secondary analytics without separate product authorization (`ai.narrative.analytics.enabled` defaults false).

## Lawful / purpose limitation (platform stance)

- Purpose: improve clarity and completeness of operational narratives under human review.
- Not for: automated approval, regulatory submission, medical diagnosis, legal conclusions, or blame assignment.
- Retention: request/draft/usage rows follow tenant data-retention policy; drafts expire per request status (`EXPIRED`).

## User-facing notice

Every generate path requires acknowledgment of:

> AI-generated content may be incomplete or inaccurate. Review and verify every statement before saving or submitting this record.

Draft labels:

- `AI DRAFT — NOT REVIEWED`
- `AI-ASSISTED — HUMAN REVIEWED` (after accept)

## Third parties

No production LLM provider is wired. When a provider is authorized later, tenant policy must record provider key, region, and whether confidential/restricted data may leave the account boundary.

## Related

- [security.md](./security.md)
- [data-classification.md](./data-classification.md)
- [narrative-policy.md](./narrative-policy.md)
