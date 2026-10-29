# Operations — FORGE-SAAS-CORE

**Closeout:** MK-S24  
**Related:** [MK-S23-production-readiness.md](./MK-S23-production-readiness.md), [AUDIT_OBSERVABILITY.md](./AUDIT_OBSERVABILITY.md)

## Health

| Check         | Where                                                                                |
| ------------- | ------------------------------------------------------------------------------------ |
| API `/health` | ALB target + container health (`forge-ecs`)                                          |
| Dev smoke     | `scripts/smoke-development.mjs`                                                      |
| Auth failures | [authentication-failure-runbook.md](../operations/authentication-failure-runbook.md) |

## Logging & audit

- CloudWatch log groups (API, worker, DB, WAF, migration) — KMS encrypted
- Application audit events: `GET /api/v1/tenants/:tenantId/audit-events`
- Domain side effects: transactional outbox → workers

## Alarms (baseline)

Defined in `forge-monitoring.ts`: unhealthy targets, API 5xx, DB CPU/connections, SQS DLQs/backlog/age, API/worker task count, optional CloudFront 5xx.

**Launch gap:** SNS subscribers still placeholder; add latency/auth/email/billing alarms before production (MK-S23).

## Support surfaces

| Role                   | Tools                                                              |
| ---------------------- | ------------------------------------------------------------------ |
| Creator / platform ops | Creator Console (tenants, entitlements, billing manage, analytics) |
| Tenant admins          | Tenant Admin (memberships, config, billing read)                   |
| Engineers              | CloudWatch, ECS exec (gated), migrate runbook                      |

## Incidents (lightweight)

1. Check ALB/API health + CloudWatch 5xx
2. Check Cognito / auth anomaly
3. Check DB connections / CPU
4. Check SQS DLQs
5. Rollback ECS task def / static sync per [DEPLOYMENT.md](./DEPLOYMENT.md)
6. DB corruption → PITR/snapshot only (forward-only migrations)

## Email / notifications

- In-app notifications: COMPLETE (API + UI)
- SES outbound: **GAP** (noop/stub) — invitations may not deliver in production until SES wired

## Data / RLS verification

Prefer non-production: `pnpm test:rls` and platform e2e when test DB available. MK-S22 full HTTP e2e remains **OUTSTANDING**.
