# Forge Platform — AWS CDK

TypeScript CDK app for commercial **development** infrastructure (Sprint 1C).

## Prerequisites

- Node.js 20+
- pnpm 10.12.1
- AWS CLI v2 (for deploy)
- Docker (for ECS image assets on deploy)

## Commands

```bash
pnpm --filter @forge/infrastructure-cdk validate
pnpm --filter @forge/infrastructure-cdk test
pnpm --filter @forge/infrastructure-cdk nag
pnpm --filter @forge/infrastructure-cdk synth
pnpm --filter @forge/infrastructure-cdk bootstrap   # once per account/region
pnpm --filter @forge/infrastructure-cdk deploy
```

Environment selection: `FORGE_ENV=development` (default).

Account/region: `CDK_DEFAULT_ACCOUNT` / `CDK_DEFAULT_REGION` or `AWS_ACCOUNT_ID` / `AWS_REGION`.

## Stacks

| Stack         | Purpose                                              |
| ------------- | ---------------------------------------------------- |
| Network       | VPC, subnets, security groups, flow logs             |
| Security      | KMS keys (general, sensitive, storage, logs, backup) |
| Data          | S3 buckets + Aurora PostgreSQL Serverless v2         |
| Identity      | Cognito user pool + app clients                      |
| Messaging     | SQS (+ DLQ) + EventBridge bus                        |
| Observability | CloudWatch log groups                                |
| Compute       | ECR, ECS Fargate, ALB, WAF                           |
| Monitoring    | Dashboard + alarms                                   |
| Backup        | AWS Backup vault/plan                                |

## Notes

- Partition-neutral helpers support future `aws-us-gov` (not deployed in 1C).
- ALB is **HTTP-only** until ACM certificate + DNS are ready.
- Destroy requires `FORGE_CONFIRM_DESTROY=YES`.
