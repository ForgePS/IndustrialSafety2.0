# ADR-003: TypeScript Strict Mode

- **Status:** Accepted
- **Review date:** 2026-10-25

## Context

Public-safety platform requires strong typing to reduce authz and data-handling defects.

## Decision

Enable TypeScript strict mode repo-wide including `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`. Disallow `any` unless documented.

## Alternatives considered

Gradual strictness; loose mode for speed

## Consequences

Higher upfront friction; safer refactors.

## Security / GovCloud impact

Reduces unsafe assignments that can leak or mishandle restricted data.
