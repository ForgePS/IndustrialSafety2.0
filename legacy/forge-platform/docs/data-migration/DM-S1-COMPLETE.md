# DM-S1 Complete — Firebase Extractor + Target Schema Contract

**Program:** FORGE-DATA-MIGRATION  
**Sprint:** DM-S1  
**Status:** PASS WITH CONDITIONS  
**Source project:** `forge-industrial-safety` only  
**Date:** 2026-08-12

## Scope honored

- Read-only logical extraction + native Firestore export
- No Firestore / Auth / Storage mutations (export is read/export only)
- No AWS customer import / Aurora seed / Cognito customer migration
- No customer DNS / traffic changes
- DM-S2 / PROD-S2 not started

## Native Firestore export

| Field              | Value                                                                                                                                     |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| EXPORT_OPERATION   | `projects/forge-industrial-safety/databases/(default)/operations/ASBjMTA5NDdmZDQ3NjAtMmU5OS0xYTI0LWE0ZDktYWFjNzI2N2IkGnNlbmlsZXBpcAkKMxI` |
| EXPORT_PREFIX      | `gs://forge-industrial-safety-firestore-migration-20260811/dm-s1-native-20260812T182856Z`                                                 |
| STARTED_AT         | 2026-08-12T18:29:01.261773Z                                                                                                               |
| COMPLETED_AT       | 2026-08-12T18:29:11.411557Z                                                                                                               |
| STATUS             | SUCCESSFUL                                                                                                                                |
| Progress documents | 42277                                                                                                                                     |

## Logical extraction

| Metric                        |                                                       Value |
| ----------------------------- | ----------------------------------------------------------: |
| Root collections              |                                                          80 |
| Root SOURCE_COUNT (live agg)  |                                                       42265 |
| Root EXTRACTED_COUNT          |                                                       42265 |
| Root DIFFERENCE               |                                                           0 |
| Subcollection rows extracted  |                       12 (`equipmentMigrationBatches/rows`) |
| Package total Firestore lines |                                                       42277 |
| Auth users extracted          |                                                          10 |
| Storage objects manifested    |                                                        9303 |
| Storage bytes manifested      |                                    16568761846 (~15.43 GiB) |
| Package location              | `.tmp-data-migration/dm-s1/migration-package/` (gitignored) |

DM-S0 baseline root documents: **42265** (unchanged vs DM-S1 live root agg). Native export document progress **42277** includes nested docs consistent with subcollection rows.

## Target schema hard gate

Industrial domain tables exist in **live development Aurora** from IND-11, but are **absent from monorepo tip Drizzle migrations through `0038`**. Persistence is **Aurora + S3** (not DynamoDB). AWS customer import remains blocked until schema gaps are closed and DDL is tip-applied.

See `DM-S1-TARGET-SCHEMA-CONTRACT.md`.

## Deliverables

### Tooling

- `tools/data-migration/firebase-extractor/`
- Command: `pnpm migration:firebase:extract`
- Hard project guard: `forge-industrial-safety` only

### Documentation

- `DM-S1-TARGET-SCHEMA-CONTRACT.md`
- `DM-S1-TENANT-MAPPING.md`
- `DM-S1-IDENTITY-MAPPING.md`
- `DM-S1-SOURCE-TARGET-MATRIX.md`
- `DM-S1-WRITE-FREEZE-PLAN.md`
- `DM-S1-ORPHAN-SUMMARY.md`
- `DM-S1-COMPLETE.md` (this file)

## Conditions / blockers for later import

1. Tip industrial DDL package not present through `0038`
2. TARGET_SCHEMA_GAP: lotoLibraries/lotoRecords, scan__, correctiveActionRecords, WC medical satellites, companyVehicleDrivers_
3. LEGACY_ALIAS tenant `"Producers Rice Mill"` not auto-normalized
4. GLOBAL templates must stay PLATFORM_GLOBAL
5. Soft facility display-name mismatches require resolution table
6. Write-freeze not executed (Functions still live) — extraction is not final cutover snapshot

## Verdict

**READY FOR DM-S2 WITH CONDITIONS**

DM-S2 remains **NOT AUTHORIZED** until explicitly approved.  
PROD-S2 remains **NOT AUTHORIZED**.  
AWS customer import: **NOT RUN**.
