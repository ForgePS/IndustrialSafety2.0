# PRODUCERS — Delta drift (CAI-S2)

**Checkpoint parent:** FORGE-DATA-MIGRATION CAI-S1R-UAT-CLOSEOUT  
**Baseline run:** `cai-s1r-apply2-20260814T110922Z`  
**Date (UTC):** 2026-08-14

## Watermarks

| Field                       | Value                                                            |
| --------------------------- | ---------------------------------------------------------------- |
| CAI_S1R_SOURCE_WATERMARK    | `2026-08-12T18:32:38.948Z` (DM-S1 logical extract `completedAt`) |
| CAI_S1R_EXTRACT_RUN_ID      | `dm-s1-2026-08-12T18-30-50-530Z-e7a9aecf`                        |
| CAI_S2_SOURCE_CAPTURE_START | `2026-08-14T12:41:05.802Z`                                       |
| CAI_S2_SOURCE_CAPTURE_END   | `2026-08-14T12:42:07.147Z`                                       |
| CAI_S2_SOURCE_WATERMARK     | `2026-08-14T12:42:07.147Z`                                       |
| CAI_S2_EXTRACT_RUN_ID       | `dm-s1-2026-08-14T12-41-05-795Z-12df4564`                        |

Detection method for Firestore collections: compare `_migration.documentId` presence and `_migration.documentUpdateTime` equality between baseline DM-S1 package and CAI-S2 capture. Property-order-only serialization differences are ignored.

## Firestore drift totals

| Class              | Count |
| ------------------ | ----: |
| NEW                |    24 |
| MODIFIED           |     6 |
| DELETED            |     0 |
| UNCHANGED          | 42259 |
| Baseline root docs | 42265 |
| Current root docs  | 42289 |

### Producers-owned subset

| Class                      | Count |
| -------------------------- | ----: |
| PRODUCERS_NEW              |    23 |
| PRODUCERS_MODIFIED         |     5 |
| PRODUCERS_DELETED          |     0 |
| Producers delta candidates |    28 |

### Top changed collections

| Collection           | CREATED | UPDATED | DELETED | Producers Δ | Matrix disposition                  |
| -------------------- | ------: | ------: | ------: | ----------: | ----------------------------------- |
| auth_audit_logs      |      10 |       0 |       0 |           9 | ARCHIVE → history                   |
| activityLogs         |       5 |       0 |       0 |           5 | ARCHIVE → history                   |
| qr_link_scan_events  |       5 |       0 |       0 |           5 | APPEND (unsafe strategy)            |
| qr_link_audit_events |       4 |       0 |       0 |           4 | ARCHIVE → history                   |
| organization_users   |       0 |       2 |       0 |           1 | users+memberships (non-import file) |
| lotoProcedures       |       0 |       1 |       0 |           1 | OPERATIONAL upsert                  |
| platformBusinesses   |       0 |       1 |       0 |           1 | tenants (non-import file)           |
| platformUsers        |       0 |       1 |       0 |           1 | users (non-import file)             |
| qr_links             |       0 |       1 |       0 |           1 | OPERATIONAL upsert                  |

## Unsafe collections

| Collection                    | Strategy          | Drift handling                                 |
| ----------------------------- | ----------------- | ---------------------------------------------- |
| content_overrides             | EXCLUDE           | no APPLY                                       |
| documentAccessEvents          | EXCLUDE / history | no destructive rewrite                         |
| personnelRosterImportSettings | EXCLUDE_APPROVED  | no APPLY                                       |
| platformBillingNotifications  | PLATFORM exclude  | no APPLY                                       |
| qr_link_scan_events           | APPEND-only       | import new scan events; do not rewrite history |

## Storage drift

| Metric           | Count |
| ---------------- | ----: |
| Baseline objects |  9303 |
| Current objects  |  9305 |
| NEW              |     2 |
| UPDATED          |     0 |
| DELETED          |     0 |

Both new objects are under `module-attachments/.../loto/procedures` (Producers). Target HEAD under promoted `tenants/{liveTenantId}/…` keys: **REUSED** (already present in documents bucket).

## Deletion semantics

No source deletions observed (`DELETED=0`). Matrix for future deletions remains:

| Domain family                                           | Behavior                                         |
| ------------------------------------------------------- | ------------------------------------------------ |
| Personnel                                               | SOFT / inactive — never hard delete              |
| Safety / incidents / inspections / LOTO / training / WC | IGNORE_SOURCE_DELETE or ARCHIVE — retain history |
| Audit / history streams                                 | APPEND / IGNORE_SOURCE_DELETE                    |

## Ambiguous ownership

`DELTA_AMBIGUOUS = 0` — every changed document carried an explicit tenant classification/key; non-Producers changes counted as expected skip / non-import.
