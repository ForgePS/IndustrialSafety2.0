# ADR-002: Package Manager

- **Status:** Accepted
- **Review date:** 2026-10-25

## Context

Need deterministic installs and workspace linking.

## Decision

pnpm `10.12.1` pinned via `packageManager` + Corepack. No mixed npm/yarn lockfiles.

## Alternatives considered

npm workspaces, Yarn Berry

## Consequences

Fast installs, strict dependency isolation; developers must enable Corepack.

## Security / GovCloud impact

Lockfile audited in CI; same tooling in all partitions.
