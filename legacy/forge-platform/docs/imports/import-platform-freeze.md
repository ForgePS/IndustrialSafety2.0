# Import Platform — Contract Freeze

**Document:** `docs/imports/import-platform-freeze.md`  
**Status:** `PLATFORM_FREEZE_PENDING_ACCEPTANCE`  
**Date:** 2026-07-30 (S8 closeout)  
**Honesty rule:** Limits marked **NOT_VERIFIED** are placeholders — do not treat as measured capacity.

This freeze does **not** authorize production tenant enablement under Outcome B. Do **not** mark this document `FROZEN` until explicit acceptance.

## Development deployment baseline

| Field                      | Value                                        |
| -------------------------- | -------------------------------------------- |
| Image tag                  | `import-s8-20260729182259`                   |
| API task definition        | `forge-development-ecs-platform-api:40`      |
| Worker task definition     | `forge-development-ecs-worker-service:25`    |
| Database baseline          | Migration `0027` (no S8 schema change)       |
| App secret LastChangedDate | Unchanged `2026-07-26T15:30:16.387000-05:00` |
| Account / region           | `511343547817` / `us-east-1` (development)   |

## Frozen contract record (directive §29)

| Field                          | Value                                                                                                  |
| ------------------------------ | ------------------------------------------------------------------------------------------------------ |
| API version                    | OpenAPI Import API `0.6.0-s6` (`docs/api/import-openapi.yaml`)                                         |
| Database baseline              | Through migration `0027`                                                                               |
| API task definition            | `:40`                                                                                                  |
| Worker task definition         | `:25`                                                                                                  |
| Frontend package version       | `@forge/import-center` `0.1.0` (console + tenant-admin invalidated with S8 banner)                     |
| Queue contract version         | `IMPORT_EXECUTE` / `IMPORT_MALWARE_SCAN` `schemaVersion: "1"`; upload detect `import.upload.detect.v1` |
| Scanner contract version       | `ImportMalwareScanner` + `reference-malware@1` (dev/test only)                                         |
| Adapter contract version       | Shared adapter interface unchanged; **product adapters: none**                                         |
| Supported source formats       | Per OpenAPI / engine (CSV/XLSX lineage from prior sprints) — no new formats in S8                      |
| Supported job states           | Shared import job state machine through `0027` / `@forge/imports` types                                |
| Supported row states           | Shared row/progress model in `@forge/imports`                                                          |
| Permission model               | 12 `import.*` codes (`IMPORT_PERMISSIONS`)                                                             |
| Production scanner restriction | **Outcome B** — production-like untrusted imports blocked (`assertScannerAllowedForEnvironment`)       |
| Step Functions decision        | **Option B — `RETAIN_SQS_ECS_WORKER_PATH`** (SFN inactive)                                             |
| Supported row limits           | **NOT_VERIFIED** on Aurora — in-process reference adapter only (500 / 5k). Do not claim 100k/250k.     |
| Supported concurrency limits   | **NOT_VERIFIED** — no measured Aurora concurrency suite                                                |
| Batch-size default             | Default **50**, min 1, max **500** (`S8_BATCH_RECOMMENDATION`)                                         |
| Known limitations              | `docs/imports/import-platform-open-limitations.md`                                                     |
| Change-control process         | See below                                                                                              |

## Frozen contract versions (detail)

| Contract                      | Version / identifier         | Location                                             |
| ----------------------------- | ---------------------------- | ---------------------------------------------------- |
| OpenAPI Import API            | `0.6.0-s6`                   | `docs/api/import-openapi.yaml`                       |
| `IMPORT_EXECUTE` message      | `schemaVersion: "1"`         | `packages/imports/src/execution/messages.ts`         |
| `IMPORT_MALWARE_SCAN` message | `schemaVersion: "1"`         | `packages/imports/src/security/messages.ts`          |
| Upload detect message         | `import.upload.detect.v1`    | `packages/imports/src/messages.ts`                   |
| Execution batch bounds        | default 50 / min 1 / max 500 | `S8_BATCH_RECOMMENDATION`                            |
| Stuck thresholds              | `STUCK_JOB_THRESHOLDS_MS`    | `packages/imports/src/security/production-guards.ts` |
| Scanner production policy     | Outcome B                    | ADR + `assertScannerAllowedForEnvironment`           |
| Step Functions posture        | `RETAIN_SQS_ECS_WORKER_PATH` | ADR; live SFN list empty                             |
| DB schema                     | Through migration `0027`     | `packages/database/drizzle/`                         |
| Import Center permissions set | 12 `import.*` codes          | `@forge/import-center` / contracts                   |
| Reference malware provider    | `reference-malware@1`        | `@forge/imports` (dev/test only)                     |
| Product adapters              | **None**                     | Explicit non-goal                                    |

## Allowed without breaking freeze

- Documentation clarifications
- Bugfixes that preserve wire contracts
- Additional tests/evidence
- Ops tooling that does not change message schemas (`import-dlq-ops.mjs`)
- UI copy for safety/Outcome B messaging that does not alter API

## Requires explicit unfreeze / version bump

- OpenAPI path or authZ changes
- Queue message schema changes
- New migration past `0027`
- Activating Step Functions (`ACTIVATE_STEP_FUNCTIONS`)
- Replacing Outcome B with Outcome A provider
- Shipping product adapters
- Changing batch max above 500 or removing production guards

## Change-control process (post-acceptance `FROZEN`)

Future shared-platform changes must require:

1. Versioning
2. Backward-compatibility review
3. Migration review
4. Adapter impact analysis
5. Security review
6. Contract tests
7. Release notes

Until status flips to `FROZEN`, treat this document as **stable for review** only (`PLATFORM_FREEZE_PENDING_ACCEPTANCE`).

## Acceptance checklist (to move to `FROZEN`)

- [x] S8 ADRs accepted (Outcome B; Option B `RETAIN_SQS_ECS_WORKER_PATH`)
- [x] Open limitations register updated
- [ ] Honest test results / closeout evidence gates complete (many still **NOT_VERIFIED**)
- [x] Ops runbooks linked
- [x] No unauthorized adapters/SFN activation/scanner bypass in tree

## Status history

| Date       | Status                               | Note                                                     |
| ---------- | ------------------------------------ | -------------------------------------------------------- |
| 2026-07-29 | `PLATFORM_FREEZE_PENDING_ACCEPTANCE` | S8 docs + guards prepared                                |
| 2026-07-30 | `PLATFORM_FREEZE_PENDING_ACCEPTANCE` | Closeout: TD `:40`/`:25`, Option B named, limits honesty |
