# Import Platform S2 — Test Report

**Date:** 2026-07-28

## Unit

| Suite                                     | Passed | Failed |
| ----------------------------------------- | ------ | ------ |
| `@forge/imports` (incl. S2 control plane) | 14     | 0      |
| `@forge/errors`                           | 1      | 0      |
| `@forge/events`                           | 3      | 0      |

## Integration / API e2e (local)

| Suite                 | Passed                                                                                               | Failed | Skipped |
| --------------------- | ---------------------------------------------------------------------------------------------------- | ------ | ------- |
| `imports.e2e.test.ts` | 1 (covers create/list/map/lifecycle/profile/template/idempotency/isolation/authz/entitlement/health) | 0      | 0       |

Covered scenarios:

- Create + retrieve job
- List/search/paginate
- Mapping replace atomic
- Profile create/archive/restore
- Template metadata
- Invalid transition rejection
- Idempotent replay + body conflict
- Entitlement denial
- Permission denial
- Missing authentication
- Cross-tenant denial (jobs/mappings/profiles)
- Guessed UUID denial
- Health regression smoke

## Typecheck

`@forge/platform-api` typecheck — PASS

## Live deploy tests

Recorded in `docs/deployment/import-platform-s2-deployment.md` and evidence JSON after ECS deploy/migrate/smoke.
