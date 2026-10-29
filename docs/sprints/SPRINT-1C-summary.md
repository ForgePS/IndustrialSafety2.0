# Sprint 1C Summary — AWS CDK Baseline and Development Infrastructure

**Sprint:** 1C  
**Date completed:** 2026-07-25  
**Status:** COMPLETE (synth/test/nag green; **development AWS environment deployed**)

## Sprint objectives

Create the AWS CDK TypeScript infrastructure foundation for commercial **development** only: VPC, KMS, S3, Aurora, Cognito, ECR, ECS/ALB, SQS/EventBridge, logging/monitoring, backups, tagging, partition utilities, cdk-nag, Dockerfiles, OIDC deploy workflow, and docs. No Academy/RMS business modules, no Firebase removal, no GovCloud deploy, no production stacks.

## What was delivered

### CDK app (`infrastructure/cdk`)

- Config: Zod schema + Environment Cost Profiles (Developer / Integration / Production)
- Constructs: VPC, security groups, KMS, buckets, Aurora, Cognito, ECR, ECS/ALB/WAF, queues, logging, monitoring, backups, tags
- Stacks: Network, Security, Data, Identity, Messaging, Observability (logs), Compute, Monitoring (dashboards/alarms), Backup
- Aspects: tagging, removal-policy, encryption/logging placeholders
- Utils: naming, partition ARNs, validation, outputs
- Tests: network, security, data, identity, compute, compliance, cost-profile (30 tests)
- Scripts: validate, synth, test, nag, deploy, guarded destroy, bootstrap

### Containers / CI

- Dockerfiles for `platform-api` and `worker-service` (non-root `node` user, monorepo-root build context)
- ADR-011 runtime database secret resolution via Secrets Manager (`loadEnvironmentAsync`)
- `.github/workflows/deploy-development.yml` (OIDC)
- Root scripts: `infra:validate|test|nag|synth|diff|bootstrap|deploy|destroy`, `smoke:development`

### Documentation

Architecture (naming, network, data, identity, AWS overview), security (encryption, IAM, network, cdk-nag), deployment (dev guide, OIDC), operations (cost controls / profiles, live inventory).

### Identity & access

- AWS Organizations already present; IAM Identity Center enabled in us-east-1
- Permission set `ForgeDeployAdmin` + user `forge-admin`
- CLI profile `forge-dev` (SSO); deploy executed as non-root assumed role

## Verification

| Check                                               | Result                                                                      |
| --------------------------------------------------- | --------------------------------------------------------------------------- |
| `pnpm infra:validate`                               | PASS (`costProfile: developer`, account `511343547817`)                     |
| `pnpm --filter @forge/infrastructure-cdk typecheck` | PASS                                                                        |
| `pnpm --filter @forge/infrastructure-cdk test`      | PASS (30 tests)                                                             |
| `pnpm infra:nag`                                    | PASS (AwsSolutionsChecks + documented suppressions)                         |
| `pnpm infra:synth`                                  | PASS → `cdk.out`                                                            |
| Local Docker builds                                 | PASS (`forge-platform-api:development`, `forge-worker-service:development`) |
| `pnpm infra:bootstrap`                              | PASS (`aws://511343547817/us-east-1`)                                       |
| `pnpm infra:deploy`                                 | PASS — all 9 Forge stacks + CDKToolkit                                      |
| `pnpm smoke:development`                            | PASS                                                                        |
| `GET /health`                                       | `healthy`                                                                   |
| `GET /ready`                                        | `ready` with `database: true`                                               |

## Deployed environment (Developer cost profile)

- Account `511343547817` / `us-east-1`
- Aurora Serverless v2 min 0 ACU (auto-pause 1h), worker desired 0, 1 NAT, flow logs to S3
- ALB: `forge-development-alb-api-1005626432.us-east-1.elb.amazonaws.com` (HTTP)
- Full inventory: `docs/operations/development-infrastructure-inventory.md`

## Issues fixed during deploy

1. CloudWatch Logs → KMS: logs CMK missing service principal grant (added partition-neutral policy)
2. Observability stack `ROLLBACK_COMPLETE` required delete-before-recreate
3. Root `pnpm infra:deploy` shadowed by pnpm's built-in `deploy` — scripts now use `pnpm run`
4. First ECR push session died mid-publish; resume succeeded with cached images

## Known development limitations (documented)

- ALB is **HTTP-only** until ACM certificate + DNS exist
- Cognito MFA optional; Advanced Security deferred
- 1 NAT Gateway (cost vs resilience)
- Interface VPC endpoints deferred
- Monitoring stack split from Observability (logs) to avoid CDK cross-stack cycles
- Secret rotation for Aurora deferred (TD item)
- RDS Proxy not created (review documented in open decisions / debt)
- Budgets feature flag present; live Budgets resource not yet confirmed via API

## Decisions recorded

See `docs/discovery/open-decisions.md` for DNS/ACM, CloudTrail/GuardDuty org trail ownership, and related items.

## Explicitly out of scope (honored)

- No Academy/RMS module rebuild
- No Firebase deletion
- No GovCloud resource deployment
- No production infrastructure
- Sprint 1D **not** started automatically
