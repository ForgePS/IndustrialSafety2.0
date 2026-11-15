# Database Migration Runbook

**Sprint:** 1E  
**Scope:** Drizzle migrations, local Aurora apply, ECS one-off migrate tasks  
**Related:** [database-migrations.md](../development/database-migrations.md), [SPRINT-1E-plan.md](../sprints/SPRINT-1E-plan.md)

## Migration inventory (Sprint 1E)

| Migration                                               | ADRs             | Contents                                                                       |
| ------------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------ |
| `0003_sprint_1e_membership_and_invitations.sql`         | ADR-020, ADR-021 | Invitations, memberships, history, session tracking, `record_version` on users |
| `0004_sprint_1e_idempotency_concurrency_onboarding.sql` | ADR-022–027      | Idempotency, event processing, onboarding sessions/steps, concurrency columns  |
| `0005_sprint_1e_identity_resolution.sql`                | ADR-029          | `forge_identity_lookup` role, SECURITY DEFINER functions, session guards       |

All tenant-owned tables: RLS enabled and forced. `forge_app` cannot bypass RLS.

## Local apply

```bash
pnpm db:migrate:local
pnpm db:migrate:status
```

Verify:

- Partial unique indexes (invitation per tenant+email, idempotency scope)
- RLS policies on new tables
- `forge_lookup_*` functions owned by `forge_identity_lookup`, not `forge_app`

Run RLS integration tests after apply:

```bash
pnpm test:rls
```

## Aurora apply (development)

Same pattern as Sprint 1D:

1. Build immutable API/migrate container image.
2. Deploy infrastructure if task definition changed.
3. Run one-off ECS migrate task against Aurora (see deployment guide).
4. Run seed task if fixtures changed.
5. Smoke test `/health` and `/ready`.

```bash
pnpm infra:deploy
# migrate + seed via ECS one-off tasks (project scripts)
pnpm smoke:development
```

## Pre-deploy checklist

| Item                 | Command / action                               |
| -------------------- | ---------------------------------------------- |
| Migrations committed | `packages/database/drizzle/*.sql`              |
| Schema matches       | `pnpm db:generate` produces no unexpected diff |
| Unit + integration   | `pnpm test`, `pnpm test:integration`           |
| RLS                  | `pnpm test:rls`                                |
| CDK synth            | `pnpm infra:synth`                             |

## Rollback policy

- **Forward-only** for Sprint 1E. No automated down migrations in Aurora.
- Failed migration: stop deploy, restore Aurora snapshot if needed (development), fix SQL, re-run migrate task.
- Never run destructive reset against shared development Aurora without team approval.

## Post-migration verification

1. Identity lookup: authenticated request resolves user without RLS errors.
2. Invitation accept creates membership link.
3. Idempotency record table accepts claims.
4. Onboarding tables present (even before HTTP handlers ship).

## Identity resolution guardrails (ADR-029)

After `0005`:

- Confirm `GRANT EXECUTE` on lookup functions to `forge_app` only.
- Confirm `REVOKE ALL FROM PUBLIC` on functions and role.
- Accidental ownership drift to `forge_app` is a **security defect** — halt deploy.

## Seed updates

Sprint 1E seeds include membership, invitation, and onboarding fixtures. Re-seed development only when documented in sprint plan; production seed strategy is out of scope.

## Escalation

- Migration lock timeout: check long-running API transactions.
- RLS policy error at runtime: compare `packages/database/src/rls.sql.ts` to applied SQL.
- Aurora Serverless pause: first query after idle may be slow; not a migration failure.

## References

- [local-database.md](../development/local-database.md)
- [development-deployment-guide.md](../deployment/development-deployment-guide.md)
- [authentication-failure-runbook.md](./authentication-failure-runbook.md)
