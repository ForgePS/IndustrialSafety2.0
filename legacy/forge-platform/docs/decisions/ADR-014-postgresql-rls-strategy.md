# ADR-014: PostgreSQL RLS strategy

**Status:** Accepted  
**Date:** 2026-07-25  
**Sprint:** 1D

## Context

Application checks alone are insufficient for shared-database multi-tenancy. We need a database-enforced backstop so a missed filter cannot return another tenant’s rows, while still allowing controlled system jobs.

## Decision

**Session GUC + RLS; missing context denies; bypass only for system jobs.**

1. On each request transaction, set `SET LOCAL app.current_tenant_id = '<tenant_uuid>'` before tenant-scoped queries.
2. RLS policies require `tenant_id = current_setting('app.current_tenant_id', true)::uuid` (or equivalent); if the setting is missing/invalid, access is denied.
3. System/background jobs that must cross tenants use a controlled bypass role or explicit `SET LOCAL` elevation — never the default API role with RLS disabled globally.
4. Prefer `SET LOCAL` so the setting ends with the transaction.

## Consequences

- Defense in depth against forgotten `WHERE tenant_id` clauses.
- Every DB path (API, worker, migration tooling) must set or intentionally bypass context.
- Misconfigured bypass is high risk; bypass usage must be rare, reviewed, and audited.
