# Import Platform — Sprint S5 Summary

**Date:** 2026-07-29  
**Status:** **READY_FOR_REVIEW**  
**Do not start S6 until S5 is ACCEPTED.**

## Deployment (development)

| Item                           | Value                                  |
| ------------------------------ | -------------------------------------- |
| Tag                            | `import-s5-20260729135433`             |
| API TD                         | `:38`                                  |
| Worker TD                      | `:23`                                  |
| Migrate                        | `0026` exit 0                          |
| Step Functions                 | DEFINITION_COMPLETE_DEPLOYMENT_PENDING |
| Health / unauth execute+status | 200 / 401 / 401                        |
| App secret                     | unchanged                              |

## Objectives

Shared import execution engine: control-plane execute/cancel/status/results,
SQS `IMPORT_EXECUTE` messages, ECS worker commit pipeline through adapters,
batches, progress, retries/DLQ handling, rollback preparation, and Step Functions
definition — without product adapters or malware.

## Completed work

- Migration `0026_import_platform_s5_execution.sql` (locks, progress, journal, batch counters)
- Drizzle: `importBatches`, `importRowErrors`, `importRollbackEvents`, `importExecutionJournal` + job execution columns
- `@forge/imports`: S5 state machine, queue contract, adapter registry, reference adapter, progress/retry/results, ASL definition
- Nest `ImportExecutionService` + routes under `/api/v1/imports/jobs/...`
- Worker `ImportSqsConsumer` routes upload detect + execute
- CDK `ForgeImportExecutionStateMachine` (inactive until Messaging deploy)
- Unit/perf tests in `@forge/imports` (38 tests)
- OpenAPI `0.5.0-s5` + architecture/ops docs

## API endpoints

| Method | Path                                | Permission                        |
| ------ | ----------------------------------- | --------------------------------- |
| POST   | `/jobs/{id}/execute`                | import.execute                    |
| POST   | `/jobs/{id}/cancel`                 | import.execute / upload / approve |
| GET    | `/jobs/{id}/status`                 | import.view                       |
| GET    | `/jobs/{id}/results`                | import.view                       |
| GET    | `/jobs/{id}/batches`                | import.view                       |
| GET    | `/jobs/{id}/batches/{batchId}`      | import.view                       |
| GET    | `/jobs/{id}/errors`                 | import.view                       |
| POST   | `/jobs/{id}/errors/{errorId}/retry` | import.error.reprocess            |
| POST   | `/jobs/{id}/rollback-request`       | import.rollback                   |

## Step Functions status

**DEFINITION_COMPLETE_DEPLOYMENT_PENDING**

Operational path: API → SQS → ECS worker. ASL + CDK construct exist; Messaging stack
activation deferred (`activate: false`).

## State transition matrix (execution)

| From                              | Action               | To                                   |
| --------------------------------- | -------------------- | ------------------------------------ |
| APPROVED                          | execute              | QUEUED                               |
| QUEUED                            | start_processing     | PROCESSING                           |
| PROCESSING                        | complete             | COMPLETED                            |
| PROCESSING                        | complete_with_errors | COMPLETED_WITH_ERRORS                |
| PROCESSING / QUEUED               | fail                 | FAILED                               |
| QUEUED                            | cancel               | CANCELLED                            |
| PROCESSING                        | cancel (safe)        | CANCELLED                            |
| COMPLETED / COMPLETED_WITH_ERRORS | rollback-request     | ROLLBACK_PENDING or ROLLBACK_REFUSED |

## Known limitations

- Step Functions not live-activated
- Reference adapter only (no product adapters)
- Rollback compensation not executed (preparation + classification only)
- Performance bound documented for in-process reference adapter (500 rows), not Aurora load test
- Authenticated end-to-end execute smoke depends on tenant fixtures (unauth 401 verified in deploy)

## Recommendation for S6

Malware scanning / verdict enforcement and sensitive-field hardening per roadmap —
do not start until S5 ACCEPTED.
