# ADR-001: Monorepo

- **Status:** Accepted
- **Review date:** 2026-10-25

## Context

Academy and RMS live in separate Firebase repositories. The rebuild needs shared packages, consistent tooling, and independent deployable apps.

## Decision

Use a new `forge-platform` pnpm + Turborepo monorepo. Legacy repos remain operational until migration cutover; code is not blindly copied in.

## Alternatives considered

- Single mega-app package
- Keep separate repos with published packages

## Consequences

Shared standards and atomic cross-cutting changes; larger repo checkout.

## Security / GovCloud impact

Single source for security packages and partition-neutral config; GovCloud builds from the same monorepo with separate pipelines later.
