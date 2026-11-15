# ADR-036 — Import API module boundaries

**Status:** Accepted  
**Date:** 2026-07-28  
**Sprint:** IMPORT-PLATFORM-S2

## Context

Universal Import needs a NestJS API control plane that is product-neutral and reuses existing platform auth, RLS, idempotency, audit, and outbox patterns. Product adapters and file processing must not leak into the shared module.

## Decision

1. Place Nest handlers in `apps/platform-api/src/modules/imports` under `/api/v1/imports`.
2. Keep DTOs, state-machine helpers, template metadata, and permission helpers in `@forge/imports`.
3. Persist through `@forge/database` Drizzle tables + `withTenantTransaction`.
4. Do not import Academy, RMS business, or Industrial domain packages into the shared import module.
5. Defer upload/parsing/workers/adapters to later sprints; S2 may only emit `NOT_AVAILABLE_UNTIL_S3` for validation/preview orchestration.

## Consequences

- Shared import API stays product-neutral.
- Configuration Platform and other modules remain unchanged aside from `AppModule` registration.
- S3+ must add storage/worker modules without redesigning auth/RLS boundaries.
