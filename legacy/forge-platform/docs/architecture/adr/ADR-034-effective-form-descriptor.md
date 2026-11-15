# ADR-034 — Effective NERIS form descriptor

- **Status:** Accepted
- **Date:** 2026-07-26
- **Sprint / Phase:** NERIS Phase 2 — Core Incident Shell

## Context

Phase 1 delivers the NERIS schema registry, value sets, condition engine, and tenant overlay services. Phase 2 requires a tenant-facing intake UI that renders all official fields without hard-coded per-field forms, while respecting overlays, conditional visibility, and applicable-module logic.

## Decision

1. **Server composition:** `IncidentFormDescriptorService` merges published registry fields, tenant field/value overlays, condition rules, and tenant NERIS configuration into an effective form descriptor returned by `GET …/neris/incidents/{id}/form-descriptor`.
2. **Client rendering:** `apps/rms-web` uses a component registry keyed by field data type and render hints — no per-field hard-coded React forms for registry fields.
3. **Specialized steps:** location, units/personnel, and classification steps map to documented official field keys via a tested mapping table; they are layout wrappers, not alternate storage.
4. **Applicable modules:** module visibility follows `NerisConditionEngine` evaluation (required, conditional, optional, not-applicable, awaiting-info, `NEEDS_REVIEW`).
5. **Immutability boundary:** official keys, option codes, payload mappings, and schema conditions remain server-enforced immutable; overlays may change labels, order, visibility, defaults, and local warnings only.

## Consequences

- Schema upgrades and overlay edits propagate to open incidents through live descriptor reads; pinned schema snapshots preserve create-time context for audit.
- rms-web stays thin — business rules remain in platform-api services reused from Phase 1.
- Creator Console schema browsers remain read-only and separate; tenant configuration editing moves to rms-web (creator-console consolidation deferred).

## References

- `apps/platform-api/src/modules/neris-incidents/incident-form-descriptor.service.ts`
- `apps/rms-web/src/app/incidents/[id]/` (schema-driven workspace)
