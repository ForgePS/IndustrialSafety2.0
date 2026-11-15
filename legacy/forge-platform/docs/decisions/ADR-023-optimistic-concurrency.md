# ADR-023: Optimistic concurrency with record_version and If-Match

**Status:** Accepted  
**Date:** 2026-07-25  
**Sprint:** 1E

## Context

Two clients editing the same resource can silently overwrite each other's changes. Sprint 1D had no concurrency control on updates, so the last write always won and the losing update disappeared with no signal. We need a standard, HTTP-native way to detect stale writes without pessimistic locking.

## Decision

**Row-level `record_version` guarded by conditional UPDATE, surfaced as ETag and If-Match.**

1. Every concurrency-controlled table carries an integer `record_version` starting at 1, incremented in the same UPDATE statement that changes the row (`WHERE id = $1 AND record_version = $2`).
2. Reads return a weak ETag of the form `W/"<record_version>"`.
3. Unsafe updates (PATCH, PUT, and state transitions) require `If-Match`.
4. A missing `If-Match` header returns 428 `PRECONDITION_REQUIRED`; a stale value returns 412 `PRECONDITION_FAILED`, both using the standard Forge error envelope.
5. Conflict logs record tenant, resource type, resource id, expected version, and actual version, and never payload contents.

## Consequences

- No silent lost updates; a stale write fails loudly with 412 instead of overwriting newer data.
- Clients must round-trip the ETag, reading before they write and echoing the value in `If-Match`.
- `record_version` is a per-row counter, not a global sequence, so it is meaningless across resources and must not be compared between different rows.
- Combining the version check into the UPDATE statement avoids a separate read-modify-write and needs no row locks.
