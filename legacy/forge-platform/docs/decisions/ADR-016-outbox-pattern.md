# ADR-016: Transactional outbox pattern

**Status:** Accepted  
**Date:** 2026-07-25  
**Sprint:** 1D

## Context

Domain writes and event publication must stay consistent. Publishing to EventBridge inside the request transaction can commit DB state then fail to publish (or the reverse), causing lost or duplicate side effects.

## Decision

**Transactional outbox; worker publishes to EventBridge.**

1. Within the same DB transaction as the domain write, insert an outbox row (payload, type, aggregate keys).
2. Do **not** call EventBridge (or other brokers) inside the request transaction.
3. A worker polls/claims outbox rows and publishes to EventBridge, then marks them published (or dead-letters on poison).
4. Consumers must be idempotent; at-least-once delivery is assumed.

## Consequences

- Atomic “state change + intent to publish” without distributed transactions.
- Slight publish lag; workers and outbox monitoring become critical path.
- Request latency no longer depends on EventBridge availability.
