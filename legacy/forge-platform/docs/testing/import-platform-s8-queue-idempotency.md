# Import Platform S8 — Queue Idempotency

**Document:** `docs/testing/import-platform-s8-queue-idempotency.md`  
**Date:** 2026-07-30  
**Status:** **VERIFIED** (design/unit plus live duplicate delivery)

## Design

| Mechanism                                   | Status                              |
| ------------------------------------------- | ----------------------------------- |
| Execution journal / batch commit boundaries | Design + prior sprint unit coverage |
| Message schema versions stable              | Frozen `schemaVersion: "1"`         |
| Visibility timeout                          | 300 s (inspected)                   |
| `maxReceiveCount`                           | 3 → DLQ                             |

## Live tests

| Test                                                                 | Status           |
| -------------------------------------------------------------------- | ---------------- |
| Inject duplicate `IMPORT_EXECUTE` for same processed job/correlation | **VERIFIED**     |
| Redelivery after visibility expiry                                   | **NOT_VERIFIED** |
| Malware scan message duplicate                                       | **NOT_VERIFIED** |

The duplicate used the original job, correlation ID, and idempotency key. The worker consumed the
message, the queue returned to empty, and the job state and committed counts remained unchanged
(2 successful, 2 created, 0 duplicate rows). The job was already `ROLLBACK_PENDING` after its
successful execution and rollback-preparation step.

Evidence: `docs/testing/evidence/import-platform/s8-queue-idempotency-live.json`

## Related

- Gap GAP-041 / DEF-S8-011
- Option B path: SQS + ECS worker (no SFN)
