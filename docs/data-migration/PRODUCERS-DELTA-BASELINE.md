# PRODUCERS — Delta baseline (CONTROLLED-AURORA-IMPORT-S1R)

**Status:** RECORDED (informational) — **DELTA_SYNC NOT RUN**  
**Date (UTC):** 2026-08-14

## Baseline anchors

| Field                                       | Value                                                                                                    |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Source package                              | DM-S2 V2 `aws-import-run-v2`                                                                             |
| Package S3 URI                              | `s3://forge-production-imports-511343547817-us-east-1/controlled-import-s1/aws-import-run-v2/aws-import` |
| Initial AWS import run                      | `cai-s1-apply2-20260813T213639Z`                                                                         |
| Remediation run                             | `cai-s1r-apply2-20260814T110922Z`                                                                        |
| Remediation release SHA                     | `75e1194bb47af1ad80c83353265b121594427257`                                                               |
| Schema tip                                  | `0040_industrial_domain_s1`                                                                              |
| Live tenant                                 | `019ff7d0-c20f-7659-81e4-c0cd68e23262`                                                                   |
| Storage baseline bucket                     | `forge-production-documents-511343547817-us-east-1`                                                      |
| Storage baseline prefix                     | `tenants/019ff7d0-c20f-7659-81e4-c0cd68e23262/`                                                          |
| Staging retained                            | `s3://forge-production-imports-511343547817-us-east-1/storage/source/`                                   |
| Initial AWS import completion (remediation) | `2026-08-14T11:13:14.405Z`                                                                               |
| File promotion completion                   | `2026-08-14T11:37Z` (approx; see promotion summary artifact)                                             |

## Watermark strategy

| Domain                | Strategy                                                                              |
| --------------------- | ------------------------------------------------------------------------------------- |
| Firestore collections | Compare `_migration.updateTime` / export generation against package extract timestamp |
| Storage               | Compare object etag/size under staging vs Firebase bucket listing after freeze        |
| Operational Aurora    | Prefer migration id-map + source_document_id idempotency                              |

## Readiness gates (CAI-S1R-UAT-CLOSEOUT)

| Gate                             | Result   |
| -------------------------------- | -------- |
| DELTA_BASELINE                   | **PASS** |
| DELTA_STRATEGY_DOCUMENTED        | **PASS** |
| DELTA_UNSAFE_COLLECTION_STRATEGY | **PASS** |

## Current source drift (measure only — do not apply)

Firebase remained live during import. Exact NEW/UPDATED/DELETED counts require a fresh Firebase extract vs immutable package — **not executed in this sprint** (informational only).

| Metric                          | Value                                                                                              |
| ------------------------------- | -------------------------------------------------------------------------------------------------- |
| NEW_SOURCE_DOCS                 | NOT MEASURED (Firebase still live)                                                                 |
| UPDATED_SOURCE_DOCS             | NOT MEASURED                                                                                       |
| DELETED_SOURCE_DOCS             | NOT MEASURED                                                                                       |
| NEW_STORAGE_OBJECTS             | NOT MEASURED                                                                                       |
| UPDATED_STORAGE_OBJECTS         | NOT MEASURED                                                                                       |
| DELETED_STORAGE_OBJECTS         | NOT MEASURED                                                                                       |
| DELTA_UNSAFE_COLLECTION_CHANGES | NOT MEASURED                                                                                       |
| CURRENT_SOURCE_DRIFT            | **PRESENT (expected)** — Firebase remained authoritative; quantify in next authorized delta sprint |

## Delta-unsafe collections (from DM-S2)

| Collection                    | Final delta strategy                                  |
| ----------------------------- | ----------------------------------------------------- |
| content_overrides             | EXCLUDE / manual review                               |
| documentAccessEvents          | EXCLUDE (audit stream)                                |
| personnelRosterImportSettings | EXCLUDE_APPROVED pattern                              |
| platformBillingNotifications  | PLATFORM / exclude from customer delta                |
| qr_link_scan_events           | APPEND-only with care; do not rewrite history blindly |

DELTA_SYNC: **COMPLETE (CAI-S2)** — see `PRODUCERS-DELTA-READINESS-CAI-S2.md`  
FIREBASE_WRITE_FREEZE: **NOT RUN**  
Next authorized phase only: **WRITE FREEZE + MICRO-DELTA** (not started).
