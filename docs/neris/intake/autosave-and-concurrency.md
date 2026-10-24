# Autosave and Concurrency (Intake)

Manual intake sessions are long-lived. Autosave must be reliable without sacrificing data integrity when two clients edit the same incident ([ADR-035](../../architecture/adr/ADR-035-autosave-concurrency-if-match.md)).

## Client behavior (rms-web)

| State          | UX                                              |
| -------------- | ----------------------------------------------- |
| Saving         | "Saving…" indicator                             |
| Saved          | "All changes saved"                             |
| Error          | Retry affordance + message                      |
| Conflict (412) | `ConflictDialog` — reload server state or retry |

Implementation: `apps/rms-web/src/hooks/use-autosave.tsx`, workspace in `incident-workspace-client.tsx`.

## Timing

- Debounce ~2 s after last edit
- Maximum wait ~10 s before flush even if user still typing

## API contract

| Operation                | Concurrency                 |
| ------------------------ | --------------------------- |
| `PATCH …/incidents/{id}` | `If-Match` on incident ETag |
| `PATCH …/field-values`   | Batch upsert; incident ETag |
| `PATCH …/narrative`      | Narrative version ETag      |
| `POST …/incidents`       | `Idempotency-Key`           |

Missing `If-Match` → `428 PRECONDITION_REQUIRED`.  
Stale version → `412 PRECONDITION_FAILED` with Forge error envelope.

## Server rules

- `record_version` incremented in the same UPDATE that applies changes
- Field values with `user_confirmed: true` reject silent prefill overwrite
- Audit events on material section saves and status transitions — not per keystroke

## Testing

See [test matrix](../testing/test-matrix.md) scenarios 4–6.

## Platform foundation

Builds on Sprint 1E ADR-023 (optimistic concurrency) and ADR-022 (durable idempotency).
