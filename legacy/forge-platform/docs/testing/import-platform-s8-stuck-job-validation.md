# Import Platform S8 — Stuck Job Validation

**Document:** `docs/testing/import-platform-s8-stuck-job-validation.md`  
**Date:** 2026-07-30  
**Status:** Helpers **VERIFIED** (unit); live stuck detection / alarms **NOT_VERIFIED**

## Thresholds (`STUCK_JOB_THRESHOLDS_MS`)

| Status            | Threshold  |
| ----------------- | ---------- |
| SCANNING          | 15 minutes |
| VALIDATING        | 30 minutes |
| READY_FOR_PREVIEW | 30 minutes |
| QUEUED            | 30 minutes |
| PROCESSING        | 2 hours    |
| ROLLBACK_PENDING  | 24 hours   |

Source: `@forge/imports` `production-guards.ts`. Unit coverage in `s8-hardening.unit.test.ts` (**VERIFIED**).

## Operational

| Item                                        | Status                                                                                            |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Runbook                                     | `docs/operations/import-stuck-job-runbook.md`                                                     |
| Live metric/alarm emission for stuck jobs   | **NOT_VERIFIED** / partial (queue-age alarm exists; stuck-helper metric wiring may be incomplete) |
| Controlled job aged past threshold detected | **NOT_VERIFIED**                                                                                  |

## Related

- Gap GAP-045 / DEF-S8-014
