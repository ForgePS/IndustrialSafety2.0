# ADR-035 — NERIS autosave and concurrency (If-Match)

- **Status:** Accepted
- **Date:** 2026-07-26
- **Sprint / Phase:** NERIS Phase 2 — Core Incident Shell

## Context

Manual intake sessions are long-lived. Officers expect autosave without losing work, but concurrent editors must not silently overwrite each other. Sprint 1E established platform-wide optimistic concurrency via `record_version`, ETag, and `If-Match` (ADR-023).

## Decision

1. **Incident-level version:** `neris_incidents.record_version` (and field-value rows where applicable) increment on mutation; reads return `ETag: W/"<recordVersion>"`.
2. **Section-scoped saves:** debounced autosave (~2 s idle, ~10 s max) batches field-value PATCH requests per workspace section rather than per keystroke.
3. **Required If-Match:** unsafe updates (`PATCH` incident, `PATCH` field-values, narrative, workflow transitions) require `If-Match`; missing header → `428 PRECONDITION_REQUIRED`, stale version → `412 PRECONDITION_FAILED` with standard Forge error envelope.
4. **Conflict UI:** rms-web `ConflictDialog` reloads server state on 412 and lets the user merge or retry; audit events record material section saves and status transitions, not individual keystrokes.
5. **Create idempotency:** `POST` create uses `Idempotency-Key` per platform durable idempotency (ADR-022).

## Consequences

- Autosave and officer review can run safely on shared drafts without pessimistic locking.
- Clients must round-trip ETags from GET/list responses before PATCH.
- Network retries must reuse the same idempotency key for creates to avoid duplicate incidents.
- Extends ADR-023 patterns to NERIS-specific resources without a parallel versioning scheme.

## References

- ADR-023 optimistic concurrency
- `apps/rms-web/src/hooks/use-autosave.tsx` (`ConflictDialog`, debounced save)
