# Deployment — FORGE-SAAS-CORE

**Closeout:** MK-S24  
**Related:** [MK-S23-production-readiness.md](./MK-S23-production-readiness.md), [development-deployment-guide.md](../deployment/development-deployment-guide.md)

**Production deploy is NOT authorized by this program state.**

## Environments

| Env         | CDK config                                     | CI                                                |
| ----------- | ---------------------------------------------- | ------------------------------------------------- |
| Development | `infrastructure/cdk/lib/config/development.ts` | `.github/workflows/deploy-development.yml` (OIDC) |
| Staging     | `staging.ts`                                   | Manual / not fully wired                          |
| Production  | `production.ts` (**placeholders**)             | **No** production workflow                        |

## Stack order

```text
Network → Security → Identity → Messaging → Data → Observability → Compute
  → Frontend / Backup / Audit / Monitoring
```

Entry: `infrastructure/cdk/bin/forge-platform.ts` (`FORGE_ENV=...`).

## Recommended production sequence (planning only)

| #   | Stage                                             |
| --- | ------------------------------------------------- |
| A   | Prerequisites (account, OIDC role, networking)    |
| B   | Secrets (DB master/app) + KMS                     |
| C   | Database backup / PITR checkpoint                 |
| D   | Schema migrations (ECS migrate, **admin** secret) |
| E   | Platform API ECS                                  |
| F   | Workers                                           |
| G   | Cognito URL confirmation                          |
| H   | S3 confirmation                                   |
| I   | Frontend sync (`scripts/sync-static-site.mjs`)    |
| J   | CloudFront invalidation                           |
| K   | DNS / ACM aliases (separate authorization)        |
| L   | External webhooks                                 |
| M   | Smoke tests                                       |
| N   | Production UAT (synthetic tenants)                |

See MK-S23 §16–19 for rollback, smoke, and UAT detail.

## Frontend deploy

```bash
# Example pattern (non-production)
pnpm deploy:console   # or sync-static-site --app ...
```

Invalidate CloudFront after sync. Static export = no Node server.

## Migrations

```bash
# Local / test only
pnpm db:migrate:local
pnpm db:migrate:test

# Aurora (authorized env): ECS one-off via scripts/run-ecs-migrate.mjs
```

Forward-only. Rollback = restore snapshot + prior image.

## Destroy guard

`infrastructure/cdk/bin/destroy-guard.ts` blocks destroy of production/staging unless `FORGE_CONFIRM_DESTROY=YES`. **Deploy** lacks an equivalent hard guard today (MK-S23 blocker).

## MK-S22 validation before go-live

```bash
pnpm db:up
pnpm db:migrate:test
pnpm --filter @forge/platform-api test:e2e
```

Must PASS with retained evidence before readiness can leave NOT READY / unconditional READY path.
