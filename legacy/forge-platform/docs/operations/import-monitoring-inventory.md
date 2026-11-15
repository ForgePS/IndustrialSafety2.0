# Import Platform — Monitoring Inventory

**Document:** `docs/operations/import-monitoring-inventory.md`  
**Date:** 2026-07-30  
**Environment:** development (`511343547817` / `us-east-1`)  
**Deployed:** tag `import-s8-20260729182259`, API `:40`, worker `:25`  
**Execution path:** API → SQS → ECS (`RETAIN_SQS_ECS_WORKER_PATH`) — monitoring does **not** depend on Step Functions

## Dashboards (CLI published)

Script: `scripts/put-import-dashboards.mjs`

| Dashboard                                        |
| ------------------------------------------------ |
| `ForgePlatform-Development-Import-Operations`    |
| `ForgePlatform-Development-Import-Security`      |
| `ForgePlatform-Development-Import-Queue-Worker`  |
| `ForgePlatform-Development-Import-Performance`   |
| `ForgePlatform-Development-Import-Tenant-Access` |

## Alarms

| Alarm                                            | Purpose                | Notes                                |
| ------------------------------------------------ | ---------------------- | ------------------------------------ |
| `forge-development-alarm-imports-backlog`        | Queue visible ≥ 100    | Baseline **OK**                      |
| `forge-development-alarm-importsdlq`             | DLQ visible ≥ 1        | Baseline **OK**                      |
| `forge-development-alarm-imports-queue-age`      | Queue age              | Created (may be `INSUFFICIENT_DATA`) |
| `forge-development-alarm-worker-running-tasks`   | Worker capacity        | Created (may be `INSUFFICIENT_DATA`) |
| `forge-development-alarm-import-scanner-blocked` | Scanner blocked metric | Created (may be `INSUFFICIENT_DATA`) |

CDK construct `forge-monitoring.ts` includes queue-age / worker / scanner-blocked; CLI alarms created — full CDK synth/deploy parity **NOT_VERIFIED** as continuous.

## Metrics sources

| Source                         | Use                                     |
| ------------------------------ | --------------------------------------- |
| AWS/SQS                        | Imports queue + DLQ depths / age        |
| AWS/ECS                        | API + worker CPU/memory / running count |
| AWS/RDS                        | Aurora cluster (dashboard widgets)      |
| `ForgePlatform/ImportSecurity` | Scanner-blocked EMF (when emitted)      |

## Runbooks

| Condition           | Runbook                                       |
| ------------------- | --------------------------------------------- |
| Backlog / queue age | `docs/operations/import-runbook.md`           |
| DLQ                 | `docs/operations/import-dlq-runbook.md`       |
| Worker down         | `docs/operations/import-worker-recovery.md`   |
| Stuck job           | `docs/operations/import-stuck-job-runbook.md` |
| Outcome B / scanner | ADR + `docs/operations/import-runbook.md`     |

## Explicit non-dependencies

- No Step Functions execution metrics required for S8 ops (Option B).
- Safe alarm trigger tests for all new alarms: **NOT_VERIFIED**.
