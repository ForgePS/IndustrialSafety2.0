# Sprint 1E Summary — Platform Hardening

**Date completed:** 2026-07-25  
**Status:** COMPLETE (code, tests, AWS deploy, migrate/seed, event pipeline proof, synthetic tenants)  
**Account / region:** `511343547817` / `us-east-1`  
**Cost profile:** Developer (worker desired count returned to 0 after proof)

## Delivered

### ADRs

ADR-020 through ADR-029 (memberships, invitations, idempotency, concurrency, onboarding, console hosting, HTTPS gating, identity resolution without RLS bypass).

### Database

Migrations applied to local Postgres, `forge_platform_test`, and development Aurora:

- `0003_sprint_1e_membership_and_invitations`
- `0004_sprint_1e_idempotency_concurrency_onboarding`
- `0005_sprint_1e_identity_resolution` (`forge_identity_lookup` + SECURITY DEFINER helpers; `sessions_revoked_at`)
- `0006_identity_lookup_execute_grants` (EXECUTE for `forge_app` and `forge_admin`)

Starter templates: Industrial, RMS, Academy in `@forge/contracts`.

### platform-api hardening

- Durable Idempotency-Key interceptor + `idempotency_records`
- ETag / If-Match / `record_version` on required mutations
- Memberships module; invitation lifecycle with Cognito admin (simulated when pool id is not real)
- Auth: `lookupIdentity`, membership-aware permissions, `/api/v1/auth/me`, `select-tenant`, `logout-all`
- Onboarding sessions API under `/api/v1/platform/onboarding/sessions`

### Worker pipeline

EventBridge `forge.platform` → integration-events SQS → worker consumer with handler registry, `event_processing_records`, EMF metrics, and five proof handlers. Scale scripts: `pnpm worker:enable:development` / `pnpm worker:disable:development`.

### CDK / edge

- HTTPS/ACM/Route 53 gated by `edge.enableHttps` (development remains HTTP until DNS)
- `ForgeFrontend`: S3 + CloudFront console hosting + budgets
- Additional CloudWatch alarms; API secure headers

### Creator Console

Login, select-tenant, invitations, memberships, onboarding wizard, dashboard, and product/permission/subscription/branding screens; `output: 'export'` for S3/CloudFront.

### Docs

API Contract v1 (`docs/api/`), seven operations runbooks (`docs/operations/`), plan + this summary.

## Tests (exact)

| Suite                                               | Result |
| --------------------------------------------------- | ------ |
| Platform API unit                                   | OK     |
| RLS isolation after 1E schema (`forge_app`)         | OK     |
| Automated 12-scenario E2E (`sprint-1e.e2e.test.ts`) | OK     |
| `pnpm lint` / `pnpm typecheck` (root)               | OK     |
| CDK synth (includes `ForgeFrontend`)                | OK     |
| Local + test DB migrations 0003–0005                | OK     |

## Deployment verification (Wave 10)

| Step                                                         | Result                                                                                                                                                 |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `cdk deploy --all` (development)                             | OK (~11 min); Compute task def `:5` after bootstrap image                                                                                              |
| Aurora migrate (ECS one-off)                                 | exit 0                                                                                                                                                 |
| Aurora seed (ECS one-off)                                    | exit 0                                                                                                                                                 |
| Platform admin bootstrap (ECS `bootstrap-admin-ecs.js`)      | exit 0 — tenant `019f9c33-2875-75aa-8d0e-e4bec722565e`, user `019f9c33-288e-7171-8d94-b76c4a4658b6`, membership `019f9c44-bb3a-7419-a0c5-ff3e84976d98` |
| Identity lookup EXECUTE grants (`0006` / `grant-lookup-ecs`) | OK — `/api/v1/auth/me` returns 23 permissions                                                                                                          |
| Worker enable → create tenant → proof handler                | OK — `platform.tenant.created.v1` / `proof.tenant-created` (~98 ms)                                                                                    |
| Worker disable                                               | desired 0 / running 0                                                                                                                                  |
| `pnpm smoke:development` `/health`                           | OK                                                                                                                                                     |
| `/ready` database                                            | true                                                                                                                                                   |
| Creator Console static sync to CloudFront                    | OK — `https://ddztl9s33wu40.cloudfront.net`                                                                                                            |

### Event pipeline proof

Correlation `5042915744d7e5df5fe0c2574b2ea72c`:

1. API `POST /api/v1/platform/tenants` wrote outbox `platform.tenant.created.v1`
2. Outbox published to EventBridge → SQS
3. Worker claimed/processed via `proof.tenant-created`
4. Log: `domain event processed` + `proof handler completed` for tenant `019f9c35-0cc1-724f-98ac-d10728b5c079`

### Synthetic acceptance tenants

| Tenant key        | Customer type   | Status | Tenant id                              |
| ----------------- | --------------- | ------ | -------------------------------------- |
| `industrial-demo` | INDUSTRIAL      | ACTIVE | `019f9c36-37fa-75a9-9506-0875e3e10f0b` |
| `rms-demo-fd`     | FIRE_DEPARTMENT | ACTIVE | `019f9c36-48b3-704b-aa13-d38ddcaca8c3` |
| `academy-demo`    | FIRE_ACADEMY    | ACTIVE | `019f9c36-545a-701a-b783-ea38eca01d60` |

Onboarded through the public onboarding API (no direct DB access) with waived subscriptions and invitation send deferred.

## Primary endpoints

| Resource           | Value                                                                     |
| ------------------ | ------------------------------------------------------------------------- |
| ALB API            | `http://forge-development-alb-api-1005626432.us-east-1.elb.amazonaws.com` |
| Console CloudFront | `https://ddztl9s33wu40.cloudfront.net`                                    |
| Console S3 bucket  | `forge-development-console-511343547817-us-east-1`                        |

## Known limitations / deferred

- Development HTTPS remains off until Route 53 / ACM DNS is delegated
- Cognito admin for invitations is simulated when the user pool is not a real operational pool
- Aurora `DATABASE_URL` currently authenticates as `forge_admin` (table owner); runtime should move to `forge_app` so FORCE RLS applies without owner bypass
- Payment processor not integrated
- Academy/RMS product modules remain out of scope

## Cost impact

No structural steady-state increase vs Sprint 1D: worker remains at desired count 0; Aurora still auto-pause capable. Brief Fargate one-offs for migrate/seed/bootstrap and a short worker window for pipeline proof only.

## Recommendation for next sprint

Turn on DNS-backed HTTPS when the hosted zone is ready, sync Creator Console to CloudFront as part of CI, deepen invitation acceptance against a real Cognito pool, and begin Phase 9 Document Engine or Configuration Studio product surfaces.
