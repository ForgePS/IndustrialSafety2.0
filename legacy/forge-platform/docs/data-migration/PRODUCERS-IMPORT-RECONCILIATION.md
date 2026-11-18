# PRODUCERS — Import reconciliation (CONTROLLED-AURORA-IMPORT-S1R)

**Status:** DB_IMPORT_COMPLETE (files promoted; delta not run)  
**Parent run:** `cai-s1-apply2-20260813T213639Z`  
**Remediation run:** `cai-s1r-apply2-20260814T110922Z`  
**Release:** `75e1194bb47af1ad80c83353265b121594427257`

## Error normalization (apply2)

| Class                      | Count |
| -------------------------- | ----- |
| INSERTED                   | 1     |
| UPDATED / SKIPPED_EXISTING | 38109 |
| EXCLUDE_APPROVED           | 143   |
| WARNING_EXPLAINED          | 3994  |
| ERROR_UNEXPLAINED          | **0** |
| FATAL                      | **0** |

## Key entity outcomes after remediation

| Entity                                    | Notes                                                        |
| ----------------------------------------- | ------------------------------------------------------------ |
| `qr_links`                                | 2524 present (idempotent update)                             |
| `qr_link_versions`                        | 2524 in-scope resolved; 2576 SKIP_MISSING_PARENT (explained) |
| `platform_ehs_audit_templates` / versions | logical `forge_tmpl_*` resolved; 34 versions loaded          |
| `industrial_attachments`                  | 13 Producers rows                                            |
| `industrial_equipment_document_links`     | 12 loaded with deterministic document stubs                  |
| Fleet vehicles                            | **0 fabricated**                                             |

## Source document accounting (unchanged disposition)

| Disposition        | Count     |
| ------------------ | --------- |
| AURORA_OPERATIONAL | 15914     |
| AURORA_HISTORY     | 26139     |
| PLATFORM_GLOBAL    | 69        |
| EXCLUDE_APPROVED   | 143       |
| S3_ARCHIVE         | 0         |
| **TOTAL**          | **42265** |

SOURCE_DOCS_ACCOUNTED: **42265** / UNACCOUNTED: **0**

## Tenant

Live: `019ff7d0-c20f-7659-81e4-c0cd68e23262`  
Package twin remap approved; twin UUID must not remain as operational `tenant_id`.
