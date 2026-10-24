# Import Platform — Observability (S8)

**Document:** `docs/architecture/import-observability.md`

## Signals

| Layer           | Signal                                          | Notes                                       |
| --------------- | ----------------------------------------------- | ------------------------------------------- |
| SQS             | Visible messages, age, DLQ depth                | Primary ops signals                         |
| ECS             | Running task count, events, deploy revisions    | API + worker services                       |
| CloudWatch Logs | correlationId / jobId / tenantId                | Never log raw row PII or presigns           |
| Aurora          | Lock contention, slow queries (standard DB ops) | No import-specific EMF pack required for S8 |
| App             | Job status / progress percent / scan events     | UI polls ~3s                                |

## Alarms (CDK `ForgeMonitoring`)

| Alarm pattern             | Metric                                   | Threshold            |
| ------------------------- | ---------------------------------------- | -------------------- |
| `*-alarm-importsdlq`      | DLQ `ApproximateNumberOfMessagesVisible` | ≥ 1                  |
| `*-alarm-imports-backlog` | Queue visible messages                   | ≥ 100 (multi-period) |
| Worker running tasks      | ECS desired/running                      | capacity loss        |

Development inspection (S8 baseline): `forge-development-alarm-importsdlq` and `imports-backlog` were **OK**; DLQ depth **0**.

No dedicated “malware scan latency” CloudWatch alarm ships in CDK for S8 — monitor SCANNING stuck jobs via thresholds + logs.

## Dashboards

Platform overview dashboards include imports queue + DLQ widgets where configured (`ForgePlatform-*-Overview`).

## Correlation

Every mutating import path should carry `correlationId` (API + queue messages). DLQ tooling emits an ops `correlationId` per session (`scripts/import-dlq-ops.mjs`).

## Stuck job monitoring

Use `isStuckImportJob` thresholds:

| Status                                  | Threshold |
| --------------------------------------- | --------- |
| SCANNING                                | 15m       |
| VALIDATING / READY_FOR_PREVIEW / QUEUED | 30m       |
| PROCESSING                              | 2h        |
| ROLLBACK_PENDING                        | 24h       |

Emit operational tickets with jobId + tenantId + correlationId only (no payload dumps).

## What not to log

- Presigned URLs
- Raw imported row values / credentials
- Full SQS message bodies into tickets (DLQ script already redacts Body)
- Malware binary content

## Runbooks

Master index: `docs/operations/import-runbook.md`

## Gaps (honest)

- Aurora multi-tenant scale metrics baselines: **PENDING_CONTROLLED_RUN** (LIM-IMP-003).
- Custom EMF import stage timers: not a shipped S8 requirement; add only with authorization.
