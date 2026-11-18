# Sprint 1B Summary — Monorepo and Development Architecture Foundation

**Sprint:** 1B  
**Date completed:** 2026-07-25  
**Status:** COMPLETE (with noted local Docker limitation)

## Sprint objectives

Create the production-grade development foundation for the Forge Platform AWS rebuild: monorepo, shared standards, local database tooling, tests, environment validation, documentation, and CI. No Academy/RMS business modules. No Firebase deletions.

## Repository structure created

`forge-platform/` monorepo with `apps/`, `packages/`, `infrastructure/cdk/`, `database/`, `migration/`, `docs/`, `scripts/`, `tests/`, `.github/`.

Legacy Firebase apps remain outside this repo (`forge-academy-backup`, `forge-rms`, `firebase-app`).

## Applications created

| App                                                                  | Status                     |
| -------------------------------------------------------------------- | -------------------------- |
| `@forge/academy-web`                                                 | Foundation shell (Next.js) |
| `@forge/rms-web`                                                     | Foundation shell (Next.js) |
| `@forge/creator-console`                                             | Foundation shell (Next.js) |
| `@forge/platform-api`                                                | NestJS health/ready API    |
| `@forge/worker-service`                                              | Job handler skeleton       |
| tenant-admin, department-portal, student-portal, public-registration | NOT_STARTED placeholders   |

## Packages created

| Package                                                       | Role                                 |
| ------------------------------------------------------------- | ------------------------------------ |
| `@forge/shared-types`                                         | Foundational types                   |
| `@forge/environment`                                          | Zod env validation                   |
| `@forge/validation`                                           | Shared Zod validators                |
| `@forge/security`                                             | Redaction, correlation IDs, sanitize |
| `@forge/observability`                                        | Structured JSON logger               |
| `@forge/testing`                                              | Synthetic fixtures                   |
| `@forge/database`                                             | Drizzle + migrate scripts            |
| `@forge/design-system`                                        | Tokens / CSS variables               |
| `@forge/ui`                                                   | Accessible primitives + env banner   |
| `@forge/typescript-config`                                    | Shared TS configs                    |
| configuration, auth, authorization, audit, events, api-client | NOT_STARTED stubs                    |

## Development tools configured

- pnpm `10.12.1` + Turborepo
- TypeScript strict base
- ESLint flat config + jsx-a11y
- Prettier + EditorConfig
- Vitest
- GitHub Actions CI + Dependabot
- Docker Compose Postgres 16 definition

## Database setup

- Compose service + init SQL for `forge_platform_local` / `forge_platform_test`
- Drizzle migration `0000_foundation` (`tenants`, `users`)
- Scripts: `db:up`, `db:migrate`, `db:migrate:status`, `db:generate`

**Local note:** Docker CLI was not available on this developer machine during verification (`docker` not on PATH). Migration SQL/journal are in-repo; CI workflow runs Postgres service + migrate. Install Docker Desktop locally to exercise `pnpm db:up` / `pnpm db:migrate`.

## Environment validation

`@forge/environment` validates all required variables; production-like envs reject missing secrets, bad partitions, and insecure public URLs. Tests cover accept-local / reject-production-missing / reject-bad-partition.

## Testing setup

Vitest unit tests for environment, security redaction, observability, validation, UI labels, worker tenant rejection, API health + no production stack leakage.

## CI status

`.github/workflows/ci.yml` configured for PR/push: install, format, lint, typecheck, unit tests, env tests, migrate, build, audit (informational). Not executed against GitHub remote in this sprint (local verification only).

## Documentation created

Architecture, development, testing, security policy docs; ADRs 001–010; CONTRIBUTING; README.

## ADRs created

ADR-001 through ADR-010 (monorepo, pnpm, strict TS, NestJS, Drizzle, PostgreSQL, CDK, partition strategy, hosting, testing).

## Security controls

- Sensitive key redaction tested
- No real personnel data / secrets committed
- Server/public env separation
- Non-production environment banner on web shells
- Synthetic test data helpers

## Known limitations

- Docker not available locally for live migrate verification on this machine
- CDK deferred to Sprint 1C (placeholder package only)
- Placeholder portal apps intentionally empty
- Next.js warned about a parent `package-lock.json` under the user home directory; apps set `outputFileTracingRoot` to the monorepo

## Open decisions

Updated in `docs/discovery/open-decisions.md`: NestJS + Drizzle + app split resolved. Remaining OD items unchanged.

## Technical debt

Added local Docker PATH / home lockfile noise items in register updates as needed.

## Commands used to verify

```text
pnpm install
pnpm format / format:check
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm --filter @forge/platform-api build
pnpm --filter @forge/worker-service build
pnpm --filter @forge/academy-web build
pnpm --filter @forge/rms-web build
pnpm --filter @forge/creator-console build
```

## Full test results

Unit tests passed for: environment (3), security (3), observability (1), validation (3), ui (1), worker-service (1), platform-api (2).

## Full build results

Packages + platform-api + worker-service + academy-web + rms-web + creator-console built successfully after tsconfig/BOM fixes.

## Recommended Sprint 1C preparation

Implement AWS CDK baseline (VPC, ECS, Aurora, Cognito, S3, SQS, KMS, CloudWatch, WAF baseline) in `infrastructure/cdk` without deploying business modules. Ensure Docker is installed for local migrate gates before 1C merge.

**Do not begin Sprint 1C automatically** — awaiting review.
