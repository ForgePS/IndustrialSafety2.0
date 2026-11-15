# Configuration Platform monitoring

**Date:** 2026-07-28  
**Environment:** development (`511343547817` / `us-east-1`)  
**API:** `forge-development-ecs-platform-api:28` / `config-accept-20260728092807`  
**Status:** PROVISIONED

## Dashboard

| Item    | Value                                                    |
| ------- | -------------------------------------------------------- |
| Name    | `forge-development-configuration-platform`               |
| Widgets | ECS CPU/Memory; Logs Insights; EMF Configuration metrics |

## Alarms

| Alarm                                            | Metric                                   | Threshold      |
| ------------------------------------------------ | ---------------------------------------- | -------------- |
| `forge-development-config-api-cpu-high`          | ECS CPUUtilization                       | > 80% for 2×5m |
| `forge-development-config-api-memory-high`       | ECS MemoryUtilization                    | > 85% for 2×5m |
| `forge-development-config-rls-denials`           | `Forge/Configuration` `ConfigRlsDenials` | ≥ 1 / 5m       |
| `forge-development-config-authorization-denials` | `ConfigAuthorizationDenials`             | ≥ 5 / 5m       |
| `forge-development-config-publish-failures`      | `ConfigPublishFailures`                  | ≥ 1 / 5m       |
| `forge-development-config-rollback-failures`     | `ConfigRollbackFailures`                 | ≥ 1 / 5m       |
| `forge-development-config-validation-failures`   | `ConfigValidationFailures`               | ≥ 10 / 5m      |

Dimensions: `Environment=development`, `Service=platform-api`. Initial state may be `INSUFFICIENT_DATA`.

## EMF emitters

Emitted from `apps/platform-api` (`configuration-metrics.ts`) on:

- authorization denials (config service)
- validation failures (payload / schedule / import)
- publish failures
- rollback failures
- RLS denial detection (Postgres RLS policy errors)

## Runbook

1. Alarm fires → dashboard `forge-development-configuration-platform`.
2. Check ECS `forge-development-ecs-platform-api`.
3. Inspect `/forge/development/platform-api` logs for EMF / `FORBIDDEN` / `VALIDATION_FAILED`.
4. Rollback API to `:27` / `config-accept-20260728054933` / `sha256:f0f139ec…` if needed.
5. Do **not** rotate app DB secret.

## Scripts

- `scripts/put-config-dashboard.mjs`
