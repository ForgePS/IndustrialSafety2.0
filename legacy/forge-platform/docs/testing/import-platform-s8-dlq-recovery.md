# Import Platform S8 — DLQ Recovery

**Document:** `docs/testing/import-platform-s8-dlq-recovery.md`  
**Date:** 2026-07-30  
**Status:** Tooling **VERIFIED**; current-patch retriable routing **NOT_VERIFIED**

## Tooling

| Item                         | Status                                               |
| ---------------------------- | ---------------------------------------------------- |
| `scripts/import-dlq-ops.mjs` | Exists — inspect / dry-run-replay / replay           |
| Body redaction               | By design (attributes + MessageId; Body not printed) |
| Runbook                      | `docs/operations/import-dlq-runbook.md`              |
| Helper script                | `scripts/import-s8-dlq-poison-exercise.mjs`          |

## Baseline inspect

Development DLQ inspect historically empty (0 messages) at S8 baseline. Re-check before claiming empty at acceptance.

## Controlled poison exercise

| Step                                          | Status                                                         |
| --------------------------------------------- | -------------------------------------------------------------- |
| Retriable message → DLQ after maxReceiveCount | **OBSERVED**, but failures predated worker `:26`               |
| Inspect sanitized metadata                    | **VERIFIED** on current baseline                               |
| Dry-run replay                                | **VERIFIED** on current baseline; no replay mutation performed |
| Confirmed replay + job recovery               | **NOT_VERIFIED**                                               |

A synthetic `IMPORT_MALWARE_SCAN` message showed three retriable `AccessDenied` failures at 30-second
intervals before entering the DLQ. The message was inspected and dry-run replayed while API `:42` and
worker `:26` were current, then deleted from the DLQ. This does not verify that a newly forced
retriable failure routes to the DLQ under worker `:26`, because the observed failures occurred before
that task revision started. Pre-existing unrelated DLQ messages were not purged.

Evidence: `docs/testing/evidence/import-platform/s8-dlq-retriable-exercise.json`

## Related

- Gap GAP-042 / DEF-S8-012
