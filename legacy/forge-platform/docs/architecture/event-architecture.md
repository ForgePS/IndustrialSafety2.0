# Event architecture (platform)

## AI Narrative audit events

AI Narrative writes dedicated rows to `ai_narrative_audit_events` (tenant-scoped) in addition to platform `audit_events` for high-signal actions such as generation success.

Actions include: `AiNarrativeRequested`, `AiNarrativeSourcePrepared`, `AiNarrativeDataRedacted`, `AiNarrativeGenerated`, `AiNarrativeGenerationFailed`, `AiNarrativeViewed`, `AiNarrativeAccepted`, `AiNarrativePartiallyAccepted`, `AiNarrativeRejected`, `AiNarrativeRegenerated`, `AiNarrativeInserted`, and policy/template/sensitive-data events.

Routine AI audit metadata includes tenant, user, product, module, record identifiers, request id, provider, source hash, and correlation id. Full restricted source payloads and full narrative bodies are **not** stored in routine audit events by default.

AI Narrative never emits domain events that finalize incidents or submit to NERIS.
