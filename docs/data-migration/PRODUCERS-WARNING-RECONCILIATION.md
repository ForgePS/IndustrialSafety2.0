# PRODUCERS — Warning reconciliation (CAI-S1R-UAT-CLOSEOUT)

**Checkpoint:** FORGE-DATA-MIGRATION CAI-S1R-UAT-CLOSEOUT  
**Remediation run:** `cai-s1r-apply2-20260814T110922Z`  
**Date (UTC):** 2026-08-14  
**Package:** `aws-import-run-v2/aws-import`

## Summary

| Gate                            | Result   |
| ------------------------------- | -------- |
| WARNING_EXPLAINED               | **3994** |
| WARNING_UNEXPLAINED             | **0**    |
| QR_SKIP_COUNT                   | **2576** |
| QR_SKIP_ACCOUNTED               | **2576** |
| QR_SKIP_UNEXPLAINED             | **0**    |
| NON_PRODUCERS_SKIP_COUNT        | **1418** |
| NON_PRODUCERS_VERIFIED          | **1418** |
| MISCLASSIFIED_PRODUCERS_RECORDS | **0**    |
| ACTIVE_QR_LINKS_BROKEN          | **0**    |
| CURRENT_QR_FUNCTIONALITY        | **PASS** |

## QR SKIP_MISSING_PARENT (2576)

Source package: 2524 `qr_links` + 5100 `qr_link_versions`.

| Check                                                                    | Result                   |
| ------------------------------------------------------------------------ | ------------------------ |
| Skipped versions whose `data.qrLinkId` is absent from package `qr_links` | 2576                     |
| Intersection of orphan parent IDs with package `qr_links` document IDs   | **0**                    |
| Intersection of orphan parent IDs with `id-map` `qr_links` entries       | **0**                    |
| Classification                                                           | **SOURCE_ORPHAN** (2576) |

Ruled out for these skips:

- valid Producers parent failed migration
- tenant remap failure
- logical ID resolution failure
- importer-order failure
- incorrectly excluded in-scope parent

Loaded target state: 2524 `qr_links` and 2524 `qr_link_versions` under live tenant; **0** loaded versions missing parent; **0** active QR links without a usable version row.

## SKIP_NON_PRODUCERS (1418)

Importer taxonomy maps `missing_tenant` → `SKIP_NON_PRODUCERS` when `awsTenantId` is null and `tenant_id` is required.

| Check                                                                                                      | Result                                                                            |
| ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Apply2 skip class count                                                                                    | 1418                                                                              |
| Package rows with null `awsTenantId` in industrial import entities                                         | 1418 (plus 6 non-industrial `tenants` / `users+memberships` rows not in the 1418) |
| Rows among skip set carrying Producers keys (`business-1782553339499` / `producers-rice-mill` / live UUID) | **0**                                                                             |

Ownership evidence used: `awsTenantId`, `awsTenantKey`, `source.tenantKey`, facility/business keys in payload — not inference from missing IDs alone.

## Evidence artifacts (local operational)

- `.tmp-data-migration/dm-s2/cai-s1r-uat/warning-reconciliation-v2.json`
- Apply2 summary taxonomy in CloudWatch / `logs-cai-s1r-apply2-20260814T110922Z.txt`
