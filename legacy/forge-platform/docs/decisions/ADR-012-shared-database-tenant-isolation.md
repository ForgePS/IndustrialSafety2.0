# ADR-012: Shared database with logical tenant isolation

**Status:** Accepted  
**Date:** 2026-07-25  
**Sprint:** 1D

## Context

Forge is multi-tenant. We need isolation strong enough for commercial and GovCloud use without the operational cost of per-tenant stacks, clusters, or databases. Schema and migration complexity must stay manageable as tenant count grows.

## Decision

**Shared Aurora PostgreSQL cluster with logical tenant isolation.**

1. All tenants share one Aurora cluster and database; tenant-owned rows carry `tenant_id`.
2. Application authorization and PostgreSQL RLS enforce tenant boundaries on every request.
3. No per-tenant CloudFormation stacks, Aurora clusters, or databases for standard product tenancy.
4. Cross-tenant access is forbidden except via explicit, audited system paths (see ADR-014).

## Consequences

- One schema and migration path for all tenants; lower infra cost and simpler ops.
- Isolation depends on correct `tenant_id` propagation, authz, and RLS — bugs can leak data across tenants.
- Extreme noisy-neighbor or compliance cases may later need dedicated capacity; that is an exception, not the default.
