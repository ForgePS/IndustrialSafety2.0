# PROD-S0R — Production infrastructure foundation plan

**Status:** AUTHORIZED for empty production foundation provisioning  
**PROD-S1 / customer cutover / Firebase migration:** NOT AUTHORIZED  
**Account:** `511343547817` (same commercial account as Development)  
**Region:** `us-east-1` (secondary `us-west-2` for DR config only)

## Stack family (actual CDK names)

| Layer                    | CloudFormation stack             |
| ------------------------ | -------------------------------- |
| Network                  | `Forge-Production-Network`       |
| Security                 | `Forge-Production-Security`      |
| Identity                 | `Forge-Production-Identity`      |
| Messaging                | `Forge-Production-Messaging`     |
| Data (Aurora + buckets)  | `Forge-Production-Data`          |
| Observability            | `Forge-Production-Observability` |
| Compute (ECS/ALB/API CF) | `Forge-Production-Compute`       |
| Monitoring               | `Forge-Production-Monitoring`    |
| Backup                   | `Forge-Production-Backup`        |
| Audit                    | `Forge-Production-Audit`         |
| Frontend (S3+CF SPAs)    | `Forge-Production-Frontend`      |

Does **not** invent parallel `PlatformApi` / `IndustrialWeb` stack names — frontends live in `Frontend`, API in `Compute`, DB in `Data`.

## Domains (configured; DNS cutover NOT done)

| Role         | Hostname                           |
| ------------ | ---------------------------------- |
| API          | `api.forgepublicsafety.com`        |
| Creator      | `creator.forgepublicsafety.com`    |
| Tenant Admin | `admin.forgepublicsafety.com`      |
| Industrial   | `industrial.forgepublicsafety.com` |
| RMS          | `rms.forgepublicsafety.com`        |
| Academy      | `academy.forgepublicsafety.com`    |
| SES sending  | `mail.forgepublicsafety.com`       |

Cognito callbacks/logouts use HTTPS URLs for these hosts. Registering URLs ≠ routing customer traffic.

## Guards

1. `FORGE_PRODUCTION_ACCOUNT` required (no `000000000000` fallback); must equal `511343547817`.
2. `FORGE_ENV=production` + `FORGE_CONFIRM_PRODUCTION_DEPLOY=YES`.
3. Caller STS account must match.
4. Dirty worktree refused by default.
5. example.com / localhost Cognito URLs refused.

## Database (empty)

- Identifier pattern: `forge-production-rds-aurora` (via `resourceName`)
- Engine: Aurora PostgreSQL 15.10
- Backup retention: production profile (35d Aurora + Backup stack)
- Deletion protection: required
- No customer seed / no Firebase import

## Deploy command (foundation only)

```bash
export FORGE_ENV=production
export FORGE_PRODUCTION_ACCOUNT=511343547817
export FORGE_CONFIRM_PRODUCTION_DEPLOY=YES
# optional: export FORGE_ALERT_EMAIL=ops@your-domain
pnpm --filter @forge/infrastructure-cdk deploy
```

Application artifact sync (`pnpm deploy:industrial-web`, etc.) remains **PROD-S1**.
