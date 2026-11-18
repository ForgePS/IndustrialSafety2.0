# Development Cost Control

**Sprint:** 1E  
**Scope:** Development AWS account steady-state spend, worker toggles, budgets, alarms  
**Related:** [cost-controls.md](./cost-controls.md), [SPRINT-1E-plan.md](../sprints/SPRINT-1E-plan.md)

## Target posture

Development uses the **Developer** cost profile (~$50–80/month):

| Control                 | Setting                                      |
| ----------------------- | -------------------------------------------- |
| Aurora Serverless v2    | Min 0 ACU, auto-pause after 60 minutes idle  |
| Worker service          | Desired count **0**                          |
| NAT Gateway             | 1 (not per-AZ)                               |
| VPC flow logs           | S3 (not CloudWatch Logs)                     |
| Interface VPC endpoints | Off                                          |
| Budget alarm            | 50/80/100/120% thresholds (Sprint 1E Wave 6) |

Source: `infrastructure/cdk/lib/config/cost-profile.ts`

## Sprint 1E additions

| Addition                               | Approximate cost                                                       |
| -------------------------------------- | ---------------------------------------------------------------------- |
| Creator Console (CloudFront + S3)      | ~$1/month ([ADR-026](../decisions/ADR-026-creator-console-hosting.md)) |
| CloudWatch dashboards and extra alarms | negligible at dev volume                                               |
| AWS Budgets (four environments)        | free tier                                                              |

No NAT or Aurora capacity tier changes in Sprint 1E.

## Worker cost control

The integration worker and outbox publisher are the main variable compute cost beyond the always-on API task.

**Steady state:** desired count 0.

**Pipeline proof (Wave 4 / Wave 10):**

```bash
pnpm worker:enable:development
# run proof tests
pnpm worker:disable:development
```

Or run outbox worker locally:

```bash
pnpm --filter @forge/worker-service dev
```

Never leave worker at 1 in development overnight without an active test window.

## HTTPS and DNS (no extra idle cost)

Edge TLS (ACM, Route 53 records, 443 listener) is implemented but **gated** on `domains.hostedZoneName` ([ADR-025](../decisions/ADR-025-edge-tls-and-dns.md)). Development stays HTTP until DNS is delegated — no ACM validation hang, no certificate renewal cost until enabled.

## Floor costs

While the stack is deployed, NAT + ALB + KMS form a ~$53/month floor ([cost-controls.md](./cost-controls.md)). Going lower requires **teardown**, not parameter tuning.

## Budget alarms

Sprint 1E configures AWS Budgets for Development, Testing, Staging, and Production with alert thresholds at 50%, 80%, 100%, and 120% of monthly budget.

**Response:**

1. Identify service spike in Cost Explorer (NAT, Fargate, Aurora ACU-hours).
2. Confirm worker desired count is 0.
3. Confirm Aurora auto-pause enabled in development.
4. Check for forgotten load tests or runaway log volume.

## Dashboards (Wave 6)

CloudWatch dashboards include API requests/errors/latency, ECS tasks, Aurora capacity, EventBridge failures, SQS/DLQ depth, worker failures, Cognito failures, WAF blocks, S3 growth, and release metadata.

Use dashboards before scaling any resource.

## Daily developer habits

- Stop local worker processes when done.
- Use `pnpm smoke:development` instead of sustained load tests.
- Prefer local Postgres for schema work; hit Aurora only for integration.
- Invalidate CloudFront only on console deploys (not on every API change).

## Production contrast

Production profile raises Aurora min ACU, multi-AZ, worker count, NAT per AZ, and security services. Do not copy production task counts into development "to test scale."

## References

- [worker-failure-runbook.md](./worker-failure-runbook.md)
- [development-infrastructure-inventory.md](./development-infrastructure-inventory.md)
- [development-deployment-guide.md](../deployment/development-deployment-guide.md)
