# Environment Cost Profiles

Named presets that set capacity, retention, and feature toggles so each environment
has an explicit cost goal.

| Environment | Goal                             | Approximate Monthly Cost |
| ----------- | -------------------------------- | ------------------------ |
| Developer   | Single developer, cost optimized | ~$50–80                  |
| Integration | Team testing, always on          | ~$100–150                |
| Production  | High availability                | Sized by workload        |

Source of truth: `infrastructure/cdk/lib/config/cost-profile.ts`

## Profile → environment mapping

| Forge env                             | Cost profile |
| ------------------------------------- | ------------ |
| `development`, `govcloud-development` | Developer    |
| `testing`, `staging`                  | Integration  |
| `production`, `govcloud-production`   | Production   |

Staging keeps the Integration profile but may raise NAT count, Aurora max ACU,
and security controls for release rehearsal.

## Developer (~$50–80)

Controls that keep a personal environment near the low end:

| Control                 | Setting                                     |
| ----------------------- | ------------------------------------------- |
| Aurora Serverless v2    | Min 0 ACU, auto-pause after 60 minutes idle |
| Worker service          | Desired count 0                             |
| NAT Gateway             | 1 (not per-AZ)                              |
| VPC flow logs           | S3 (not CloudWatch Logs)                    |
| Interface VPC endpoints | Off                                         |
| Budget alarm            | $100/month                                  |

Approximate continuous-run breakdown (us-east-1, idle DB outside work hours):

| Item                           | Est. $/mo |
| ------------------------------ | --------- |
| NAT Gateway                    | 32        |
| ALB                            | 16        |
| Fargate API (1 × 0.25 vCPU)    | 9         |
| Aurora compute (mostly paused) | 0–6       |
| Aurora storage + backups       | 3–6       |
| WAF                            | 6–10      |
| KMS (5 keys)                   | 5         |
| Logs / S3 / Secrets / ECR      | 3–8       |

NAT + ALB + KMS form a ~$53 floor while the stack stays deployed. Going lower
requires teardown, not tuning.

## Integration (~$100–150)

Always-on team testing profile:

| Control              | Setting                            |
| -------------------- | ---------------------------------- |
| Aurora Serverless v2 | Min 0.5 ACU (no auto-pause), max 4 |
| Worker service       | Desired count 1                    |
| NAT Gateway          | 1                                  |
| VPC flow logs        | S3                                 |
| Budget alarm         | $200/month                         |

## Production (sized by workload)

High-availability baseline; raise ACUs and task counts to match traffic:

| Control                 | Setting                                                |
| ----------------------- | ------------------------------------------------------ |
| Aurora Serverless v2    | Min 2 ACU, max 32, Multi-AZ, deletion protection       |
| Compute                 | API desired 3, worker desired 2 (scale from here)      |
| NAT Gateway             | 3 (one per AZ)                                         |
| Interface VPC endpoints | On                                                     |
| Flow logs               | CloudWatch Logs                                        |
| Security                | WAF, Macie, GuardDuty, Security Hub, Inspector, Backup |
| Budget alarm            | $5000/month (adjust per tenant workload)               |

The schema rejects Aurora auto-pause (`serverlessMinCapacity: 0`) in production.

## Guardrails

- `costProfile` is a required field on every environment config.
- CDK assertion tests pin Developer settings for the development deploy target:
  Aurora auto-pause, S3 flow logs, single NAT, worker at 0 tasks.
- Do not silent-suppress production cost or security regressions.
