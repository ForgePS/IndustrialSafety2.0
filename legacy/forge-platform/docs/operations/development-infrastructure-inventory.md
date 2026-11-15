# Development infrastructure inventory

**Account:** `511343547817`  
**Region:** `us-east-1`  
**Partition:** `aws`  
**Environment:** `development`  
**Cost profile:** Developer (~$50–80/mo)  
**Deployed:** 2026-07-25  
**Deploy identity:** `forge-admin` via IAM Identity Center (`ForgeDeployAdmin`)

## CloudFormation stacks

| Stack                           | Status          |
| ------------------------------- | --------------- |
| CDKToolkit                      | CREATE_COMPLETE |
| Forge-Development-Network       | CREATE_COMPLETE |
| Forge-Development-Security      | UPDATE_COMPLETE |
| Forge-Development-Identity      | CREATE_COMPLETE |
| Forge-Development-Messaging     | CREATE_COMPLETE |
| Forge-Development-Data          | CREATE_COMPLETE |
| Forge-Development-Observability | CREATE_COMPLETE |
| Forge-Development-Compute       | CREATE_COMPLETE |
| Forge-Development-Monitoring    | CREATE_COMPLETE |
| Forge-Development-Backup        | CREATE_COMPLETE |

## Primary outputs

| Resource             | Value                                                                           |
| -------------------- | ------------------------------------------------------------------------------- |
| VPC                  | `vpc-07219410902223b22`                                                         |
| Private app subnets  | `subnet-09971b07b33602377`, `subnet-06282af20db0a76c5`                          |
| NAT Gateway          | `nat-062081e623636e190` (1)                                                     |
| ALB DNS              | `forge-development-alb-api-1005626432.us-east-1.elb.amazonaws.com`              |
| ECS cluster          | `forge-development-ecs-platform`                                                |
| Aurora endpoint      | `forge-development-rds-aurora.cluster-c876w2qgijz1.us-east-1.rds.amazonaws.com` |
| Documents bucket     | `forge-development-documents-511343547817-us-east-1`                            |
| Cognito User Pool    | `us-east-1_VYjUFLXG4`                                                           |
| Academy client ID    | `7j8chsikjtbktnsh8dc4aj6has`                                                    |
| CloudWatch dashboard | `ForgePlatform-Development-Overview`                                            |
| Backup vault         | `forge-development-backup-primary`                                              |

## Capacity / cost knobs (live)

| Setting                  | Value                    |
| ------------------------ | ------------------------ |
| Aurora engine            | aurora-postgresql 15.10  |
| Aurora min/max ACU       | 0 / 2 (auto-pause 3600s) |
| API desired / running    | 1 / 1                    |
| Worker desired / running | 0 / 0                    |
| NAT gateways             | 1                        |
| Flow logs                | S3                       |

## KMS aliases

- `alias/forge-development-kms-general`
- `alias/forge-development-kms-sensitivedata`
- `alias/forge-development-kms-storage`
- `alias/forge-development-kms-logs`
- `alias/forge-development-kms-backup`

## ECR repositories

- `forge-development-ecr-platformapi`
- `forge-development-ecr-workerservice`
- `forge-development-ecr-academyweb`
- `forge-development-ecr-rmsweb`
- `forge-development-ecr-creatorconsole`

## Smoke verification (2026-07-25)

```text
GET http://forge-development-alb-api-1005626432.us-east-1.elb.amazonaws.com/health
→ {"status":"healthy","service":"platform-api","environment":"development",...}

GET http://.../ready
→ {"status":"ready","checks":{"database":true},...}

pnpm smoke:development  (FORGE_ALB_DNS set)
→ Smoke OK
```

## Identity Center (deploy access)

| Item           | Value                                                |
| -------------- | ---------------------------------------------------- |
| Portal         | https://d-90667981af.awsapps.com/start               |
| User           | `forge-admin`                                        |
| Permission set | `ForgeDeployAdmin` (AdministratorAccess, 8h session) |
| CLI profile    | `forge-dev` (`aws sso login --profile forge-dev`)    |

## Known gaps after deploy

- ALB is HTTP-only (no ACM certificate / custom DNS yet)
- AWS Budgets resource not observed via `describe-budgets` (feature flag present; wiring may be incomplete)
- Root CLI profile still present for break-glass; day-to-day use `forge-dev`
