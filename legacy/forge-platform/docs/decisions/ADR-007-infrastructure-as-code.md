# ADR-007: Infrastructure as Code

- **Status:** Accepted
- **Review date:** 2026-10-25

## Context

Manual Firebase/console drift is unacceptable for enterprise AWS.

## Decision

AWS CDK in TypeScript under `infrastructure/cdk` (implemented in Sprint 1C).

## Alternatives considered

Terraform, SAM, Console clicking

## Consequences

Typed infra aligned with app language; CDK learning curve.

## Security / GovCloud impact

Same constructs parameterized by partition/account; no hard-coded commercial ARNs.
