# ADR-004: Backend Framework

- **Status:** Accepted
- **Review date:** 2026-10-25

## Context

Need structured TypeScript APIs with validation, DI, and clear module boundaries.

## Decision

NestJS for `platform-api` and future domain APIs. Do not mix multiple backend frameworks without a new ADR.

## Alternatives considered

Fastify-only, Express, Hono

## Consequences

Opinionated structure; Nest learning curve; strong fit for enterprise modules.

## Security / GovCloud impact

Central filters/guards for correlation IDs, errors, and authz hooks.
