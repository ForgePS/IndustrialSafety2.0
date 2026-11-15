# ADR-008: Commercial and GovCloud Partition Strategy

- **Status:** Accepted
- **Review date:** 2026-10-25

## Context

Future GovCloud deployment must not depend on commercial AWS at runtime.

## Decision

Partition-neutral configuration via `@forge/environment` (`AWS_PARTITION` = `aws` | `aws-us-gov`). Separate accounts, secrets, pipelines, and data. Shared source code only.

## Alternatives considered

Forked GovCloud codebase; runtime cross-partition calls

## Consequences

Slightly more env complexity; safer compliance boundary.

## Security / GovCloud impact

Foundational control for operational separation.
