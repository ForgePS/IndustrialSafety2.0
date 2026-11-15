# ADR-010: Testing Strategy

- **Status:** Accepted
- **Review date:** 2026-10-25

## Context

Critical controls (tenant isolation, redaction, env validation) must be automated early.

## Decision

Vitest for unit/integration; Playwright reserved for later e2e; CI runs format/lint/typecheck/tests/build/migrations. Synthetic fixtures only.

## Alternatives considered

Jest-only; skip tests until features exist

## Consequences

Foundation packages ship with tests; e2e expands later.

## Security / GovCloud impact

Redaction and env rejection tests are mandatory gates.
