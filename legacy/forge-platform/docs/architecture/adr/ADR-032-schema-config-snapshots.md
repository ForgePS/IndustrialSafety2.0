# ADR-032 — NERIS schema and configuration snapshots

- **Status:** Accepted
- **Date:** 2026-07-26
- **Sprint / Phase:** NERIS Phase 2 — Core Incident Shell

## Context

Incidents may span days or weeks. The published NERIS schema and tenant overlay configuration can change while a draft is open. Submit and finalize workflows must be evaluated against the definitions that were in effect at key lifecycle points, not whatever happens to be current when a reviewer opens the record.

## Decision

1. **Schema snapshot at create:** each incident pins `schema_version_id` and stores a row in `neris_incident_schema_snapshots` referencing the published version and checksum at creation time.
2. **Configuration snapshots at workflow gates:** append-only rows in `neris_incident_configuration_snapshots` capture the effective tenant overlay/configuration state when the incident is submitted for review and again at finalize.
3. Snapshots are immutable after write; they are read models for audit and historical rendering, not editable configuration.
4. Live editing continues to use current registry + overlay services; snapshots are written by `NerisIncidentsService` on submit and finalize transitions only.

## Consequences

- Reviewers can trust that submitted incidents were validated against a known schema/configuration bundle.
- Schema upgrades do not retroactively alter in-flight incidents tied to an earlier version.
- Storage grows with submit/finalize events; retention policies can archive old snapshot JSON later without losing ledger integrity.
- APIs expose `GET …/schema-snapshot` and `GET …/configuration-snapshots` for support and audit.

## References

- `apps/platform-api/src/modules/neris-incidents/neris-incidents.service.ts` (`writeConfigurationSnapshot`)
- `apps/platform-api/src/modules/neris-incidents/incident-form-descriptor.service.ts` (`buildConfigurationSnapshot`)
