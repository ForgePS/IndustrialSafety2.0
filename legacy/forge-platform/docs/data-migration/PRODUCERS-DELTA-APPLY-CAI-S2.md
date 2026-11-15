# PRODUCERS — Delta apply (CAI-S2)

**DELTA_RUN_ID:** `cai-s2-delta-20260814T125000Z`  
**Dry-run ID:** `cai-s2-delta-20260814T124800Z`  
**Idempotency re-apply:** `cai-s2-delta-idempotency-20260814T125600Z`  
**Package:** `s3://forge-production-imports-511343547817-us-east-1/controlled-import-s1/cai-s2-delta/aws-import`  
**PRE_DELTA_RECOVERY_POINT:** `forge-production-pre-cai-s2-delta-20260814t124800z` (AVAILABLE)  
**PITR:** enabled (`EarliestRestorableTime` retained)

## Apply taxonomy

| Class                      | Count |
| -------------------------- | ----: |
| INSERTED                   |    25 |
| UPDATED / SKIPPED_EXISTING | 38110 |
| EXCLUDE_APPROVED           |   142 |
| WARNING_EXPLAINED          |  3995 |
| ERROR_UNEXPLAINED          | **0** |
| FATAL                      | **0** |
| SKIP_MISSING_PARENT        |  2576 |
| SKIP_NON_PRODUCERS         |  1419 |
| FABRICATED_VEHICLES        |     0 |

## Business row apply (authoritative)

| Entity                         | Inserted |                 Updated |
| ------------------------------ | -------: | ----------------------: |
| industrial_qr_link_scan_events |        5 |                      46 |
| industrial_history_records     |       18 |                   25307 |
| Operational LOTO / QR / etc.   |    0 new | included in UPDATED set |

## Dry-run vs apply reconciliation

| Metric                  | Dry-run |             Apply | Notes                                          |
| ----------------------- | ------: | ----------------: | ---------------------------------------------- |
| Scan event inserts      |       5 |                 5 | Match                                          |
| History inserts         |      18 |                18 | Match                                          |
| id-map taxonomy inserts |      25 |                 2 | Bookkeeping counter variance                   |
| id-map row count delta  |       — | +25 (42260→42285) | Actual map growth matches dry-run planned maps |
| ERROR / FATAL           |       0 |                 0 | Match                                          |

**APPLY_UNEXPLAINED (business): 0**  
Taxonomy `INSERTED` differs because dry-run over-counts id-map insert events; Aurora id-map cardinality confirms +25 maps as planned.

## Idempotency

Second apply of the same package (`cai-s2-delta-idempotency-20260814T125600Z`):

| Metric            | Result   |
| ----------------- | -------- |
| INSERTED          | **0**    |
| ERROR_UNEXPLAINED | **0**    |
| FATAL             | **0**    |
| DELTA_IDEMPOTENCY | **PASS** |

## Attachment keys

Post-apply remap check: 13/13 attachments already on promoted `tenants/{liveTenantId}/…` keys; HEAD PASS; `BROKEN_ATTACHMENT_REFERENCES=0`.  
Repo helper `promoteStorageKeyForLiveTenant` added so future importer builds write canonical keys.

## Verdict

**DELTA_APPLIED: PASS**  
**DELTA_APPLY_RECONCILIATION: PASS**
