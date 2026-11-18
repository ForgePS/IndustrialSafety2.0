# CONTROLLED-AURORA-IMPORT-S1R — Remediation + File Promotion

**Checkpoint:** FORGE-DATA-MIGRATION CONTROLLED-AURORA-IMPORT-S1R  
**Date (UTC):** 2026-08-14  
**Parent import run:** `cai-s1-apply2-20260813T213639Z`  
**Parent checkpoint:** CONTROLLED-AURORA-IMPORT-S1

## Release / image provenance

| Item                     | Value                                                                                           |
| ------------------------ | ----------------------------------------------------------------------------------------------- |
| REMEDIATION_RELEASE_SHA  | `75e1194bb47af1ad80c83353265b121594427257`                                                      |
| Prior remediation commit | `04cf5123b3b5db883d3e4c6057d6f93b84382856`                                                      |
| IMPORTER_IMAGE           | `511343547817.dkr.ecr.us-east-1.amazonaws.com/forge-production-ecr-platformapi:cai-s1r-75e1194` |
| IMAGE_DIGEST             | `sha256:f8dabd13813c19be9923382d6fc73d1216ddee13917ca0c6ce4b61ee369d3178`                       |
| TASK_DEFINITION          | `forge-production-ecs-platform-api:15`                                                          |
| IMAGE_PROVENANCE         | **PASS** (TD:15 points at exact digest)                                                         |
| REMOTE_SYNC              | **PASS**                                                                                        |

## Approvals / authorization

| Gate                        | Result                                                                                                         |
| --------------------------- | -------------------------------------------------------------------------------------------------------------- |
| IMPORT_APPROVAL             | **PASS** — sprint AUTHORIZED=YES; runtime gate `FORGE_IMPORT_AUTHORIZED=true`                                  |
| IMPORT_APPROVAL_AUDIT       | **PASS** — `IMPORT_RUN` / `IMPORT_SUMMARY` CloudWatch events with actor env, runId, tenant, gitSha, timestamps |
| Approval UI failure (prior) | Classified as **UI-only / workflow tooling**; backend authorization path preserved                             |

## Snapshots

| Snapshot        | Status                                                                          |
| --------------- | ------------------------------------------------------------------------------- |
| PRE_DDL         | `forge-production-pre-industrial-ddl-20260813t190746z` (AVAILABLE)              |
| PRE_IMPORT      | `forge-production-pre-producers-import-20260813-20260813t205903z` (AVAILABLE)   |
| PRE_REMEDIATION | **PASS** `forge-production-pre-producers-remediation-20260813-20260814t101012z` |

## Remediation runs

| Run                               | Mode                        | Result                                                  |
| --------------------------------- | --------------------------- | ------------------------------------------------------- |
| `cai-s1r-dry-20260814T100557Z`    | dry-run (TD:14 / `04cf512`) | **PASS** — ERROR_UNEXPLAINED=0 FATAL=0                  |
| `cai-s1r-apply-20260814T103255Z`  | apply                       | completed_with_errors — 1 unexplained inspection status |
| `cai-s1r-apply2-20260814T110922Z` | apply (TD:15 / `75e1194`)   | **PASS** — ERROR_UNEXPLAINED=0 FATAL=0                  |

### Apply2 taxonomy

| Class                                                        | Count |
| ------------------------------------------------------------ | ----- |
| INSERTED                                                     | 1     |
| UPDATED / SKIPPED_EXISTING                                   | 38109 |
| EXCLUDE_APPROVED                                             | 143   |
| WARNING_EXPLAINED (SKIP_NON_PRODUCERS + SKIP_MISSING_PARENT) | 3994  |
| ERROR_UNEXPLAINED                                            | **0** |
| FATAL                                                        | **0** |

### Residual classification (explained)

| Class                                    | Count | Notes                                                                 |
| ---------------------------------------- | ----- | --------------------------------------------------------------------- |
| SKIP_MISSING_PARENT (`qr_link_versions`) | 2576  | Parent QR link IDs absent from Producers package/id-map; not invented |
| SKIP_NON_PRODUCERS                       | 1418  | platform-default / non-Producers rows                                 |

### Remediation inserts that cleared S1 residuals

| Entity                                 | Outcome                                                       |
| -------------------------------------- | ------------------------------------------------------------- |
| `qr_link_versions`                     | 2524 resolved (1326 insert + 1198 prior); 2576 explained skip |
| `platform_ehs_audit_template_versions` | 34 inserted via `forge_tmpl_*` logical id map                 |
| `industrial_attachments`               | 13 inserted (`entity_type` / filename defaults)               |
| `industrial_equipment_document_links`  | 12 inserted (+ deterministic `platform_documents` stubs)      |
| `industrial_inspections`               | final 1 inserted after per-row upsert fix                     |

## Tenant gates

| Gate         | Target                                                                             |
| ------------ | ---------------------------------------------------------------------------------- |
| Live tenant  | `019ff7d0-c20f-7659-81e4-c0cd68e23262`                                             |
| Package twin | `5da680d3-50f5-46ac-8b85-6cf454b6a0da` (remap only; must not remain as row tenant) |
| Schema       | `0040_industrial_domain_s1`                                                        |

## Files

| Item                         | Value                                                                                          |
| ---------------------------- | ---------------------------------------------------------------------------------------------- |
| AUTHORITATIVE_STORAGE_BUCKET | `forge-production-documents-511343547817-us-east-1`                                            |
| CUSTOMER_PREFIX_MODEL        | `tenants/{liveTenantId}/…` with Firebase `business-1782553339499` remapped to live tenant UUID |
| KMS_KEY                      | `arn:aws:kms:us-east-1:511343547817:key/6e96628b-16ff-4d12-9e3b-ea3a095af38f`                  |
| PUBLIC_ACCESS                | **BLOCKED**                                                                                    |
| Staging                      | `s3://forge-production-imports-511343547817-us-east-1/storage/source/` (retained)              |

### Staged inventory (corrected)

| Class                             | Count                                                  |
| --------------------------------- | ------------------------------------------------------ |
| CUSTOMER                          | 9290                                                   |
| PLATFORM_GLOBAL                   | 14 (`business-forge-default` + `platform-*` templates) |
| EXCLUDED (`dqf-exports/test/...`) | 1                                                      |
| AMBIGUOUS                         | 0                                                      |
| TOTAL                             | 9305                                                   |

Mission brief 9292/12 treated as approximate; corrected classification above is authoritative for promotion.

## Stop line

Firebase remains live SoR. **Delta sync / write freeze / DNS / Cognito customer migration / cutover: NOT RUN.**

## Verdict (after CAI-S1R-UAT-CLOSEOUT)

DB remediation gates: **PASS**. File promotion: **PASS** (9290 customer objects). Interactive module UAT / WC authz / cross-tenant matrix: **PASS** — see `PRODUCERS-AWS-UAT.md`, `PRODUCERS-WC-SECURITY-UAT.md`, `PRODUCERS-CROSS-TENANT-UAT.md`, `PRODUCERS-WARNING-RECONCILIATION.md`.

**INITIAL_IMPORT_STATUS: COMPLETE**  
**Next phase authorized only: READY FOR DELTA SYNC** (delta itself **NOT RUN**).
