# ADR-006: Database Selection

- **Status:** Accepted
- **Review date:** 2026-10-25

## Context

Firebase/Firestore lacks relational constraints and portable RLS for multi-tenant public safety data.

## Decision

PostgreSQL locally (Docker 16) targeting Amazon Aurora PostgreSQL-Compatible in AWS.

## Alternatives considered

Continue Firestore; DynamoDB

## Consequences

Relational modeling and migrations required; stronger consistency and isolation options.

## Security / GovCloud impact

Aurora available in GovCloud with separate accounts/pipelines; no commercial snapshot copy assumed.
