# CONTROLLED-AURORA-IMPORT-S1 — Producers Rice Mill

**Checkpoint:** FORGE-DATA-MIGRATION CONTROLLED-AURORA-IMPORT-S1  
**Date (UTC):** 2026-08-13  
**Release SHA:** `d2ccdb408a05ceca1fe53b086b160eac4078a9f8`  
**Importer images:** `d2ccdb4` (DDL), `d2ccdb4-cai-s1` / `d2ccdb4-cai-s1b` (import remediations)  
**Verdict:** **NEEDS REVIEW**

## Scope honored

Authorized: production Industrial DDL, controlled Aurora import, reconciliation prep, evidence.  
Not run: Firebase freeze/shutdown, DNS/traffic cutover, Cognito customer migration, source/staging deletion, delta sync.

## Environment

| Item         | Value                                                                                                      |
| ------------ | ---------------------------------------------------------------------------------------------------------- |
| Account      | `511343547817`                                                                                             |
| Region       | `us-east-1`                                                                                                |
| Cluster      | `forge-production-rds-aurora` (Aurora PostgreSQL 15.10, available)                                         |
| Admin secret | `forge-production-secrets-database` (ARN only; never printed)                                              |
| App secret   | `forge-production-secrets-database-app`                                                                    |
| Runtime role | `forge_app` (NOSUPERUSER, NOBYPASSRLS)                                                                     |
| ECS API      | `forge-production-ecs-platform-api` (rolled to `:11` for industrial release; importer one-offs used `:13`) |

## Tenant ID reconciliation (critical)

| Source                                    | UUID                                       |
| ----------------------------------------- | ------------------------------------------ |
| DM-S2 package / twin mapping              | `5da680d3-50f5-46ac-8b85-6cf454b6a0da`     |
| **Live production** `producers-rice-mill` | **`019ff7d0-c20f-7659-81e4-c0cd68e23262`** |

Importer remaps package tenant → live production tenant. Do not create a second Producers tenant.

## Schema deploy

| Gate                                                        | Result                                                          |
| ----------------------------------------------------------- | --------------------------------------------------------------- |
| Baseline before                                             | `0038_mk_s21_security_hardening`                                |
| Pending applied                                             | `0039_module_catalog_s2`, `0040_industrial_domain_s1`           |
| Schema after                                                | `0040_industrial_domain_s1` (`created_at` when=`1754950000000`) |
| PRE_DDL snapshot                                            | **PASS** `forge-production-pre-industrial-ddl-20260813t190746z` |
| PRODUCTION_SCHEMA_DEPLOY                                    | **PASS**                                                        |
| SCHEMA_VALIDATION (required tables + RLS enabled)           | **PASS**                                                        |
| CROSS_TENANT_READ/WRITE                                     | **DENIED**                                                      |
| WC_MEDICAL_SECURITY (`app.industrial_wc_medical_access=on`) | **PASS**                                                        |

## Import package

| Gate                   | Result                                                                                                                                                               |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Package                | `.tmp-data-migration/dm-s2/aws-import-run-v2/aws-import` → `s3://forge-production-imports-511343547817-us-east-1/controlled-import-s1/aws-import-run-v2/aws-import/` |
| Source docs            | 42265                                                                                                                                                                |
| File checksums         | 71/71 payload files match manifest                                                                                                                                   |
| Manifest label         | `industrial-live-ind11-contract-v1` (entities align to 0040 tables; label not rewritten)                                                                             |
| EXCLUDE_APPROVED lines | 143 (14 excluded files)                                                                                                                                              |

## Import execution

| Item                | Value                                                                              |
| ------------------- | ---------------------------------------------------------------------------------- |
| PRE_IMPORT snapshot | **PASS** `forge-production-pre-producers-import-20260813-20260813t205903z`         |
| Dry-run             | `cai-s1-dry-20260813T210401Z` — **PASS** (0 errors; platform-default rows skipped) |
| Apply #1            | `cai-s1-apply-20260813T211040Z` — completed_with_errors (5204)                     |
| Apply #2 (FK remap) | `cai-s1-apply2-20260813T213639Z` — completed_with_errors (**3962**)                |
| IMPORT_RUN_STATUS   | **NEEDS_REVIEW** (not COMPLETE)                                                    |

### Apply #2 residual errors (sample)

| Entity                                 | Errors | Notes                                                                        |
| -------------------------------------- | ------ | ---------------------------------------------------------------------------- |
| `qr_link_versions`                     | 3902   | ~2576 versions reference QR link IDs outside Producers id-map; 1198 inserted |
| `platform_ehs_audit_template_versions` | 34     | `templateId` is logical `forge_tmpl_*`, not Firestore doc id                 |
| `industrial_attachments`               | 13     | remaining mapping/required-column gaps                                       |
| `industrial_equipment_document_links`  | 12     | remaining FK/mapping gaps                                                    |
| `industrial_inspections`               | 1      | status null edge case                                                        |

Core Producers operational inserts from apply (examples): sites 26, personnel 1058, equipment 2489, LOTO procedures 2539, QR links 2524, history 25307, fleet drivers 201, WC cases 27, incidents 12. Fabricated vehicles: **0**.

## Not completed in this sprint

- Final apply remediation (`d2ccdb4-cai-s1c` FK-skip + logical-id index — coded locally, not re-applied after approval UI failure)
- Authoritative file promotion of 9292 customer objects
- Full AWS Industrial UAT matrix
- Delta baseline / drift report against live Firebase
- Marking import run COMPLETE

## Rollback readiness

| Level | Action                                                                                               |
| ----- | ---------------------------------------------------------------------------------------------------- |
| 1     | Logical delete by migration run / id-map where supported (not executed)                              |
| 2     | Restore Aurora from `forge-production-pre-producers-import-20260813-20260813t205903z` (not executed) |

Staging S3 corpus remains intact.

## Firebase / cutover

| Gate                       | Status  |
| -------------------------- | ------- |
| FIREBASE_ACTIVE            | YES     |
| FIREBASE_CHANGED           | NO      |
| FIREBASE_WRITE_FREEZE      | NOT RUN |
| CUSTOMER_TRAFFIC_CHANGED   | NO      |
| CUSTOMER_DNS_CHANGED       | NO      |
| CUSTOMER_CUTOVER           | NOT RUN |
| CUSTOMER_COGNITO_MIGRATION | NOT RUN |

## Next authorized steps (separate gate)

1. Finish importer remediation apply (logical template IDs + skip missing parent FKs).
2. Reconcile DB vs manifest expected writes for Producers-scoped rows.
3. Promote 9292 customer files to documents bucket; keep global/orphan out of tenant prefix.
4. Platform-admin AWS UAT + WC medical UAT.
5. Record delta baseline; do **not** start delta sync/cutover without new authorization.
