# Import Platform — Operations Runbook Index (S8)

**Document:** `docs/operations/import-runbook.md`  
**Role:** Master ops index for Universal Import Platform  
**Execution path:** API → SQS → ECS worker (Step Functions Option B — inactive)

## Production restrictions (read first)

| Restriction           | Decision       | Effect                                                                                                  |
| --------------------- | -------------- | ------------------------------------------------------------------------------------------------------- |
| `reference-malware@1` | ADR Outcome B  | Untrusted file imports **blocked** in production-like `APP_ENV` (`staging`, `production`, `govcloud-*`) |
| Step Functions        | ADR Option B   | No live state machine; do not page on SFN                                                               |
| Product adapters      | Out of scope   | Reference adapter / generic keys only                                                                   |
| Migrations            | Through `0027` | No S8 schema change expected for hardening-only                                                         |

Guards: `packages/imports/src/security/production-guards.ts`  
ADRs: `docs/decisions/import-malware-provider-production-decision.md`, `docs/decisions/import-step-functions-production-decision.md`

## Quick triage

| Symptom                                         | Start here                                                                           |
| ----------------------------------------------- | ------------------------------------------------------------------------------------ |
| DLQ depth ≥ 1 / `importsdlq` ALARM              | [DLQ runbook](./import-dlq-runbook.md) — tooling `scripts/import-dlq-ops.mjs`        |
| Worker crash / zero tasks / redelivery storms   | [Worker recovery](./import-worker-recovery.md)                                       |
| Job stale in SCANNING / QUEUED / PROCESSING / … | [Stuck job](./import-stuck-job-runbook.md) — thresholds in `STUCK_JOB_THRESHOLDS_MS` |
| Cancel mid-flight                               | [Cancellation](./import-cancellation-runbook.md)                                     |
| Data loss / corruption / DR drill               | [Backup / restore](./import-backup-restore.md)                                       |
| Upload/scan refused in staging/production       | [Scanner restriction](#scanner-restriction-outcome-b)                                |

## Runbook catalog

| Topic                              | Document                                                              |
| ---------------------------------- | --------------------------------------------------------------------- |
| DLQ inspect / dry-run / replay     | `docs/operations/import-dlq-runbook.md`                               |
| Worker failure & lock recovery     | `docs/operations/import-worker-recovery.md`                           |
| Stuck job detection                | `docs/operations/import-stuck-job-runbook.md`                         |
| Cancellation (QUEUED / PROCESSING) | `docs/operations/import-cancellation-runbook.md`                      |
| Backup / PITR / S3 versioning      | `docs/operations/import-backup-restore.md`                            |
| Legacy retry/DLQ notes             | `docs/operations/import-retry-dlq-runbook.md` (prefer S8 DLQ runbook) |
| Platform overview ops              | `docs/operations/import-platform.md`                                  |

## Stuck thresholds (canonical)

| Status            | Threshold  |
| ----------------- | ---------- |
| SCANNING          | 15 minutes |
| VALIDATING        | 30 minutes |
| READY_FOR_PREVIEW | 30 minutes |
| QUEUED            | 30 minutes |
| PROCESSING        | 2 hours    |
| ROLLBACK_PENDING  | 24 hours   |

Source: `STUCK_JOB_THRESHOLDS_MS` in `@forge/imports`.

## Batch defaults

| Setting            | Value  |
| ------------------ | ------ |
| Default batch size | 50     |
| Minimum            | 1      |
| Maximum            | 500    |
| Recommended range  | 50–250 |

Source: `S8_BATCH_RECOMMENDATION` / `DEFAULT_EXECUTION_BATCH_SIZE`.

## Scanner restriction (Outcome B)

In production-like environments, API upload initialize/complete and worker malware processing **refuse** `reference-malware`. Error code: `IMPORT_SCANNER_PROVIDER_UNAVAILABLE`. **No administrator bypass.**

Allowed for scanner use: `local`, `development`, `testing` only.

Ops response:

1. Confirm `APP_ENV` and configured provider key.
2. Do not attempt config bypass.
3. Inform requestor that production imports require an authorized production-grade provider (Outcome A).
4. Cite ADR + limitation LIM-IMP-001 (MITIGATED / Outcome B).

## Alarms (development naming)

| Alarm                                | Meaning                                 |
| ------------------------------------ | --------------------------------------- |
| `forge-*-alarm-importsdlq`           | Imports DLQ visible ≥ 1                 |
| `forge-*-alarm-imports-backlog`      | Imports queue visible ≥ 100 (sustained) |
| `forge-*-alarm-imports-queue-age`    | Age / lag signal (when present)         |
| `forge-*-alarm-worker-running-tasks` | Worker capacity                         |

## Architecture & security references

- Overview: `docs/architecture/import-platform-overview.md`
- Execution: `docs/architecture/import-execution.md`
- Security: `docs/architecture/import-security.md`
- Observability: `docs/architecture/import-observability.md`
- Threat model: `docs/security/import-threat-model.md`
- Open limitations: `docs/imports/import-platform-open-limitations.md`

## Escalation ladder

1. Platform on-call
2. Import Platform engineering
3. Security (malware, quarantine, isolation, Outcome B disputes)
4. DB on-call (Aurora lock / PITR)
