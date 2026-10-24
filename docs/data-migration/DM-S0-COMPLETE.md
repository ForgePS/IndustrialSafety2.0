# DM-S0 Complete — Firebase Customer Data Inventory

**Program:** FORGE-DATA-MIGRATION  
**Sprint:** DM-S0  
**Status:** PASS WITH CONDITIONS  
**Source project:** `forge-industrial-safety` only  
**Date:** 2026-08-12

## Scope honored

- Read-only discovery and inventory only
- No Firestore/Auth/Storage mutations
- No Firestore export executed
- No AWS customer import / seeding
- No customer DNS or traffic changes
- `firehouse-dashboards` not inventoried or referenced as a migration source

## Preflight

| Check                             | Result                           |
| --------------------------------- | -------------------------------- |
| GCP account                       | `admin@forgepublicsafety.com`    |
| GCP / Firebase project            | `forge-industrial-safety`        |
| Project access                    | PASS                             |
| Project guard in tooling          | PASS (refuses any other project) |
| Existing dirty worktree preserved | YES                              |

## Headline counts (live)

| Metric                                   | Value                                     |
| ---------------------------------------- | ----------------------------------------- |
| Firestore database                       | `(default)` · `nam5` · `FIRESTORE_NATIVE` |
| Root collections                         | 80                                        |
| Firestore documents (sum of counts)      | 42,265                                    |
| Distinct business/tenant keys observed   | 4 (see ownership doc)                     |
| Sites (facility proxies)                 | 27                                        |
| Firebase Auth users                      | 10 (all enabled, password provider)       |
| Customer Storage objects                 | 9,303                                     |
| Customer Storage bytes                   | ~15.43 GiB                                |
| Realtime Database                        | NOT USED (HTTP shallow probe 404)         |
| Composite indexes                        | 92                                        |
| Cloud Functions (active writers/helpers) | 28 listed                                 |

## Deliverables

### Tooling

- `tools/data-migration/firebase-inventory/` — read-only TypeScript inventory CLI
- Command: `pnpm migration:firebase:inventory`
- Hard project guard: `EXPECTED_PROJECT=forge-industrial-safety`

### Machine evidence (gitignored)

- `.tmp-data-migration/dm-s0/*.json`

### Documentation (committed, redacted)

- `docs/data-migration/DM-S0-COMPLETE.md` (this file)
- `docs/data-migration/DM-S0-FIREBASE-INVENTORY.md`
- `docs/data-migration/DM-S0-TENANT-OWNERSHIP.md`
- `docs/data-migration/DM-S0-SOURCE-TARGET-MATRIX.md`
- `docs/data-migration/DM-S0-CUTOVER-RISKS.md`

## Firestore native export plan (NOT RUN)

Verified export-capable buckets already exist, including:

- `forge-industrial-safety-firestore-migration-20260811`
- `industrialsafety_data_export`
- `industrialsafety_data_migration`

Planned command for a later authorized sprint (do not execute in DM-S0):

```bash
gcloud firestore export \
  gs://forge-industrial-safety-firestore-migration-20260811/dm-s1-$(date -u +%Y%m%dT%H%M%SZ) \
  --database="(default)" \
  --project=forge-industrial-safety
```

## DM-S1 requirements (not started)

DM-S1 must become the immutable Firestore extractor / migration package:

1. Extract all 80 root collections + known subcollection `equipmentMigrationBatches/{id}/rows`
2. Preserve document IDs, timestamps, references, and bytes fields with stable serialization
3. Tenant filter primary key: `businessId` with fallbacks `organizationId` / `companyId` / `tenantId`
4. Resolve ambiguous keys (`GLOBAL`, display-name businessId) before load
5. Auth package: UID + claims + email linkage metadata (no password material in DM-S0; hash export only if later authorized)
6. Storage object metadata map by path → businessId (bucket `forge-industrial-safety.firebasestorage.app`)
7. Pagination / resume for large collections (`activityLogs` ~18k, QR audit/version families)
8. Orphan reference report generation (facility/personnel/attachment)
9. Align target industrial schema presence in AWS monorepo (currently not in tip drizzle migrations)

## Verdict

**READY FOR DM-S1 WITH CONDITIONS**

DM-S1 remains **NOT AUTHORIZED** until explicitly approved.  
PROD-S2 remains **NOT AUTHORIZED**.
