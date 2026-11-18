# ADR-009: Application Hosting Strategy

- **Status:** Accepted
- **Review date:** 2026-10-25

## Context

Need scalable web + API + worker hosting.

## Decision

Next.js apps for web shells; NestJS API on ECS Fargate (Sprint 1C+); workers on ECS/Lambda as appropriate. Local Docker only for Postgres in 1B.

## Alternatives considered

All-Lambda SSR; single SPA on S3 only

## Consequences

Clear app boundaries; infra work deferred to 1C.

## Security / GovCloud impact

Hosting choices must remain partition-parameterized.
