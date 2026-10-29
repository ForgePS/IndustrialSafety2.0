# PRODUCERS — Delta dry-run (CAI-S2)

**DELTA_RUN_ID (dry-run):** `cai-s2-delta-20260814T124800Z`  
**Package:** `s3://forge-production-imports-511343547817-us-east-1/controlled-import-s1/cai-s2-delta/aws-import`  
**Parent baseline:** `cai-s1r-apply2-20260814T110922Z`  
**Mode:** dry-run (no business writes)  
**Task definition:** `forge-production-ecs-platform-api:17`

## Watermarks

| Field                    | Value                      |
| ------------------------ | -------------------------- |
| CAI_S1R_SOURCE_WATERMARK | `2026-08-12T18:32:38.948Z` |
| CAI_S2_SOURCE_WATERMARK  | `2026-08-14T12:42:07.147Z` |

## Taxonomy

| Class                      | Count |
| -------------------------- | ----: |
| INSERTED (planned)         |    48 |
| UPDATED / SKIPPED_EXISTING | 38110 |
| EXCLUDE_APPROVED           |   142 |
| WARNING_EXPLAINED          |  3995 |
| ERROR_UNEXPLAINED          | **0** |
| FATAL                      | **0** |
| SKIP_MISSING_PARENT (QR)   |  2576 |
| SKIP_NON_PRODUCERS         |  1419 |

## Gate results

| Gate                         | Result |
| ---------------------------- | ------ |
| DELTA_ERROR_COUNT            | **0**  |
| DELTA_UNEXPLAINED_SKIP_COUNT | **0**  |
| DELTA_AMBIGUOUS              | **0**  |
| FABRICATED_VEHICLES          | **0**  |

## Notes

- Full-package idempotent upsert dry-run against live Producers tenant (existing tooling).
- Planned inserts (48) cover new history/audit/scan/event rows plus any newly resolvable operational children relative to current Aurora state.
- QR orphan skip count unchanged at 2576 (SOURCE_ORPHAN classification retained).
- Identity collections (`tenants` / `users` / `users+memberships`) remain non-import files.
- Attachment storage keys will be remapped to promoted `tenants/{liveTenantId}/…` form post-apply if the running image still emits Firebase-relative keys; helper `promoteStorageKeyForLiveTenant` added in repo for subsequent importer builds.

## File delta (pre-apply)

| Metric             | Count |
| ------------------ | ----: |
| DELTA_FILES_NEW    |     0 |
| DELTA_FILES_REUSED |     2 |
| DELTA_FILES_FAILED |     0 |

## Verdict

**DELTA_DRY_RUN: PASS** — authorized to apply immutable package.
