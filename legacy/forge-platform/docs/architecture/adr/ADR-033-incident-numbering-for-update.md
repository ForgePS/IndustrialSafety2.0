# ADR-033 — NERIS incident numbering with SELECT FOR UPDATE

- **Status:** Accepted
- **Date:** 2026-07-26
- **Sprint / Phase:** NERIS Phase 2 — Core Incident Shell

## Context

Fire departments require unique, sequential incident numbers scoped by tenant and optionally by station, category, or fiscal period. Client-side or read-modify-write numbering races produce duplicate numbers under concurrent creates. Numbers must never be computed solely in the browser.

## Decision

1. **Configuration:** `neris_incident_number_configs` holds format templates with tokens `{PREFIX}`, `{SUFFIX}`, `{YEAR2}`, `{YEAR4}`, `{STATION}`, `{AGENCY}`, `{SEQ:n}`, reset mode (`CALENDAR` / `FISCAL` / `NONE`), and scope (`NONE` / `STATION` / `CATEGORY`).
2. **Sequences:** `neris_incident_number_sequences` rows track `next_value` per `(config_id, period_key, station_id, category_key)` scope.
3. **Claim inside transaction:** `IncidentNumberingService.claimNextNumber` executes `SELECT … FOR UPDATE` on the matching sequence row inside `withTenantTransaction`, increments atomically, and formats the rendered number.
4. **Ledger:** `neris_incident_numbers` records every assignment with status (`ASSIGNED`, `MANUAL`, `RESERVED`, `VOIDED`) and enforces unique `(tenant_id, number)`.
5. Manual numbers are allowed only when `allow_manual` is true on the tenant config; duplicates return `409 CONFLICT`.

## Consequences

- Concurrent creates never share a sequence value; concurrency tests assert two simultaneous creates receive distinct numbers.
- Default config is created lazily on first incident create for a tenant.
- Number format changes apply only to future assignments; the ledger preserves historical assignments.
- VOIDED numbers remain in the ledger for audit; they are not reused automatically in Phase 2.

## References

- `apps/platform-api/src/modules/neris-incidents/incident-numbering.service.ts`
- Migration: `packages/database/drizzle/0010_neris_incident_shell.sql`
