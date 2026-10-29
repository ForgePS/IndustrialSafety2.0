# NERIS Phase 4F — Increment report (deploy + Cognito acceptance)

**Date:** 2026-07-27  
**Account:** `511343547817` · **Region:** `us-east-1` · **Profile:** `forge-dev`  
**Phase 5:** NOT AUTHORIZED — stopped after 4F

## Deployed

| Stack           | Notes                                                                                                                                                                    |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ForgeMessaging  | CAD intake/normalization/matching/application/polling/retention queues + schedules                                                                                       |
| ForgeCompute    | API + worker images; worker `desiredCount=1`; CAD queue env + tenant allowlists                                                                                          |
| ForgeMonitoring | CAD DLQ alarms (`--exclusively`)                                                                                                                                         |
| ForgeData       | **Unintended dependency update** during Compute deploy (TaggingAspect metadata). App secret **unchanged**. Prefer `cdk deploy ForgeCompute --exclusively` going forward. |

## Data / flags

- Migrations `0013`–`0019` applied via ECS one-off (admin secret)
- Platform seed refreshed CAD feature definitions + permissions
- CAD flags enabled **only** on `rms-synthetic-fd`; removed from B if present
- `RMS_SYNTHETIC_ADMIN` granted 29 non-raw-payload `rms.cad.*` permissions
- Worker allowlist: `CAD_POLLING_TENANT_IDS` / `CAD_RETENTION_TENANT_IDS` = `019f9e06-a0b2-75f4-9e0b-5ae9befd8193`

## RMS Web

- Rebuilt/synced after fixing `scripts/sync-static-site.mjs` (AWS CLI Windows `None`/`\r\n` export pollution; CloudFront invalidation with `shell:false`)
- CloudFront invalidation completed

## Safety checks

| Check                        | Result                                  |
| ---------------------------- | --------------------------------------- |
| App secret ARN suffix        | `…SknUu5`                               |
| App secret `LastChangedDate` | `2026-07-26T15:30:16-05:00` (unchanged) |
| API `/health`                | 200                                     |
| RMS origin                   | 200                                     |
| FORCE RLS                    | Not weakened                            |

## Cognito e2e

```text
pnpm exec playwright test --project=chromium --grep "@phase4"
20 passed (≈1.2m)
```

Spec: `apps/rms-web-e2e/tests/phase-4-cad-acceptance.spec.ts`  
Matrix: `docs/neris/testing/phase-4-cad-scenario-matrix.md`

## Scripts added

- `scripts/run-ecs-enable-cad-flags.mjs`
