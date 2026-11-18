# ADR-022: Durable idempotency records for unsafe mutations

**Status:** Accepted  
**Date:** 2026-07-25  
**Sprint:** 1E

## Context

Clients retry failed or timed-out requests, and network conditions can duplicate an unsafe mutation. Sprint 1D left an unused `idempotency_keys` table and no interceptor, so a retried tenant or subscription mutation could execute twice. We need durable, tenant-scoped idempotency that gives clients exactly-once observable behaviour on retries.

## Decision

**A durable `idempotency_records` table, claimed by a NestJS interceptor before the mutation runs.**

1. A new `idempotency_records` table supersedes the unused `idempotency_keys`, scoped by tenant, user, HTTP method, and route template.
2. Columns: key, request_hash (SHA-256 of the canonical JSON body), status (PROCESSING, COMPLETED, FAILED, EXPIRED), response_status, response_body, resource_type, resource_id, created_at, expires_at (24h), and completed_at.
3. A NestJS interceptor claims the key by inserting a PROCESSING row inside a unique constraint.
4. A concurrent duplicate loses the race and either replays the stored response or receives 409 `IDEMPOTENCY_CONFLICT` while the original is still PROCESSING.
5. Reusing a key with a different request_hash always returns 409.
6. The mechanism applies to tenant, organization, person, invitation, membership, subscription, entitlement, and feature-flag mutations.

## Consequences

- Exactly-once observable behaviour on retries, since a repeated key replays the recorded response rather than re-executing the mutation.
- Storage cost is bounded by a 24h expiry sweep of EXPIRED records.
- The interceptor must run outside the domain transaction, so a crash between commit and record completion leaves a PROCESSING row; that row expires rather than blocking the key forever.
- A mismatched request_hash reliably signals client error (key reuse with a different body) instead of silently overwriting.
