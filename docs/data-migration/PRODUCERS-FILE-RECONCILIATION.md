# PRODUCERS — File reconciliation (CONTROLLED-AURORA-IMPORT-S1R)

**Status:** COMPLETE (customer promotion executed)  
**Date (UTC):** 2026-08-14

## Source corpus (staging — retained)

`s3://forge-production-imports-511343547817-us-east-1/storage/source/`

| Class                                         | Count    |
| --------------------------------------------- | -------- |
| Customer                                      | 9290     |
| Platform global                               | 14       |
| Excluded orphan test (`dqf-exports/test/...`) | 1        |
| Ambiguous                                     | 0        |
| **Total**                                     | **9305** |

Inventory note: mission brief cited 9292/12; staged classification corrected to 9290/14 (includes `business-forge-default` + `platform-*` template assets).

## Authoritative destination

| Item            | Value                                                                         |
| --------------- | ----------------------------------------------------------------------------- |
| Bucket          | `forge-production-documents-511343547817-us-east-1`                           |
| Customer prefix | `tenants/019ff7d0-c20f-7659-81e4-c0cd68e23262/…`                              |
| Remap           | Firebase `business-1782553339499` → live tenant UUID in key path              |
| KMS             | `arn:aws:kms:us-east-1:511343547817:key/6e96628b-16ff-4d12-9e3b-ea3a095af38f` |
| Public access   | BLOCKED                                                                       |
| Method          | S3 server-side `CopyObject` + SSE-KMS                                         |

## Promotion results

| Metric                                        | Value    |
| --------------------------------------------- | -------- |
| CUSTOMER_FILES_PROMOTED_OR_IDENTICAL_EXISTING | **9290** |
| PLATFORM_GLOBAL under Producers prefix        | **0**    |
| ORPHAN_TEST_FILE_PROMOTED                     | **NO**   |
| TARGET_KEY_COLLISIONS                         | **0**    |
| AMBIGUOUS_FILES                               | **0**    |
| MISSING_CUSTOMER_FILES                        | **0**    |
| UNEXPLAINED_FILE_DIFFERENCE                   | **0**    |
| FILE_SAMPLE_INTEGRITY (spot head + SSE-KMS)   | **PASS** |

Evidence: `.tmp-data-migration/dm-s2/cai-s1r/file-promotion-summary.json` (local operational artifact; not committed).

## Closeout consistency (CAI-S1R-UAT-CLOSEOUT)

| Gate                            | Result                                                         |
| ------------------------------- | -------------------------------------------------------------- |
| FILE_CLASSIFICATION_CONSISTENT  | **PASS** (manifest + promotion summary + delta baseline agree) |
| CUSTOMER_FILES_ACCOUNTED        | **9290**                                                       |
| PLATFORM_GLOBAL_FILES_ACCOUNTED | **14**                                                         |
| EXCLUDED_FILES_ACCOUNTED        | **1**                                                          |
| TOTAL_ACCOUNTED                 | **9305**                                                       |
| BROKEN_ATTACHMENT_REFERENCES    | **0** (after storage_key remap)                                |

### Attachment storage_key alignment

File promotion wrote objects under `tenants/{liveTenantId}/…` with `business-1782553339499` → live UUID substitution inside the key. Imported `industrial_attachments.storage_key` initially retained Firebase-relative keys. Closeout remapped **13/13** Producers attachment keys to the promoted scheme; S3 HEAD **PASS** for all samples (PDF + image content types).
