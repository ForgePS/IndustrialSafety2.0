# ADR-005: ORM Selection

- **Status:** Accepted
- **Review date:** 2026-10-25

## Context

Need migrations, typed queries, and first-class support for PostgreSQL RLS/session settings.

## Decision

Drizzle ORM + `postgres.js` for `@forge/database`.

## Alternatives considered

Prisma (strong DX, heavier RLS story), raw SQL only

## Consequences

SQL-oriented models; excellent migration control; less magic than Prisma.

## Security / GovCloud impact

Supports `SET LOCAL` tenant context patterns required for RLS.
