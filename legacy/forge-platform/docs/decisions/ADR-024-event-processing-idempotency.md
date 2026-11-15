# ADR-024: Event delivery to SQS and idempotent worker processing

**Status:** Accepted  
**Date:** 2026-07-25  
**Sprint:** 1E

## Context

The outbox pattern (ADR-016) publishes domain events to EventBridge with at-least-once delivery, which means a consumer can see the same event more than once. Without a consumer-side guard, a redelivered event would apply its side effect twice. We need reliable routing from the domain bus to a worker and a processing model that is safe under duplicates and poison messages.

## Decision

**EventBridge routes to SQS; the worker deduplicates per handler before invoking it.**

1. An EventBridge rule on the Forge domain bus matches `source = forge.platform` and routes to the existing integration-events SQS queue, with a DLQ after 3 receives.
2. The worker runs two loops: the outbox publisher (unchanged) and an SQS consumer with a typed handler registry keyed by event type.
3. Before invoking a handler, the worker inserts into `event_processing_records` keyed by (event_id, handler_name) with a unique constraint; a duplicate insert short-circuits as already-processed.
4. Events without a resolvable event id, type, or tenant context are rejected straight to the DLQ rather than retried.
5. Handlers run inside `withTenantTransaction` so RLS (see ADR-014) applies to worker writes too.
6. Structured logs and EMF-style duration and failure metrics are emitted per event.

## Consequences

- At-least-once delivery becomes effectively-once per handler, since the (event_id, handler_name) unique constraint blocks a second application.
- The `event_processing_records` table grows with every processed event and needs periodic pruning.
- Poison messages surface on the DLQ alarm instead of looping forever, because unroutable events and repeated failures land in the DLQ.
- Running handlers inside `withTenantTransaction` keeps worker writes under the same tenant isolation as API writes.
