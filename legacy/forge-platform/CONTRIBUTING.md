# Contributing to Forge Platform

## Branch conventions

- `feature/` — new capability
- `fix/` — bug fix
- `security/` — security hardening
- `infrastructure/` — CDK/CI/ops
- `migration/` — data migration work
- `documentation/` — docs-only

## Commits

Prefer conventional commits: `feat:`, `fix:`, `security:`, `infra:`, `docs:`, `test:`, `refactor:`, `chore:`.

## Pull requests

- Include tests for behavior changes
- Update docs when contracts/env/process change
- CI must pass (format, lint, typecheck, tests, build, migrations)
- No real secrets, SSNs, FEMA SIDs, or production exports

## Sensitive data prohibition

Do not store real personnel, medical, disciplinary, banking, or credential data in fixtures, screenshots, seeds, or docs.

## Migrations

- Versioned migrations only
- No destructive production resets
- Document breaking changes

## Definition of done

Matches the platform directive: working code, tests, docs, tenant/security awareness, no placeholders presented as complete features.
