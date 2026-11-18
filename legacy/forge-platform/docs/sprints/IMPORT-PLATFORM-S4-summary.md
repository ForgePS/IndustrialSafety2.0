# Import Platform — Sprint S4 Summary

**Date:** 2026-07-29  
**Status:** **READY_FOR_REVIEW**  
**Do not start S5 until S4 is ACCEPTED.**

## Objectives

Duplicate detection framework, merge candidates (no auto-merge), ZIP migration
bundle validation, external API import configuration framework, profile
enhancements, and duplicate review APIs — without record commits.

## Completed work

- Migration `0025_import_platform_s4_duplicates.sql` applied on Aurora (exit 0)
- Drizzle: `importRows`, `importDuplicateCandidates`, `importProfileVersions` + profile rule columns
- `@forge/imports`: deterministic duplicate engine, ZIP validator, API source framework, S4 DTOs
- Nest: stage rows, detect duplicates, review/approve/reject, ZIP validate, API config validate, profile S4 patch + versions
- Unit tests: **27 passed** in `@forge/imports` (including 7 S4 duplicate tests)
- OpenAPI `0.4.0-s4` + architecture / ops / deployment docs updated
- API deployed: TD `:35`, image `import-s4-20260729124000`

## API endpoints added (under `/api/v1/imports`)

| Method | Path                              | Permission                                   |
| ------ | --------------------------------- | -------------------------------------------- |
| GET    | `/duplicates`                     | import.view                                  |
| GET    | `/duplicates/{id}`                | import.view                                  |
| POST   | `/duplicates/{id}/review`         | import.preview                               |
| POST   | `/duplicates/{id}/approve`        | import.approve                               |
| POST   | `/duplicates/{id}/reject`         | import.approve                               |
| POST   | `/jobs/{jobId}/rows/stage`        | import.upload                                |
| POST   | `/jobs/{jobId}/duplicates/detect` | import.validate                              |
| POST   | `/zip/validate`                   | import.validate                              |
| POST   | `/api-sources/validate`           | import.profile.manage                        |
| GET    | `/profiles/{id}/versions`         | import.view                                  |
| PATCH  | `/profiles/{id}`                  | supports duplicateRules / zip / api metadata |

> Directive examples used `/api/v1/import/...` (singular). Platform routes remain
> `/api/v1/imports/...` for consistency with S2/S3.

## Files created (primary)

- `packages/database/drizzle/0025_import_platform_s4_duplicates.sql`
- `packages/imports/src/duplicates/engine.ts`, `detector.ts`
- `packages/imports/src/formats/zip.ts`
- `packages/imports/src/api/source.ts`
- `packages/imports/src/s4-dto.ts`, `s4-duplicates.unit.test.ts`
- `apps/platform-api/src/modules/imports/import-duplicates.service.ts`
- `docs/architecture/import-platform/IMPORT_DUPLICATE_DETECTION.md`
- `docs/architecture/import-platform/IMPORT_ZIP_VALIDATION.md`
- `docs/architecture/import-platform/IMPORT_API_IMPORT_FRAMEWORK.md`
- `docs/deployment/import-platform-s4-deployment.md`
- `docs/sprints/IMPORT-PLATFORM-S4-summary.md` (this file)
- `docs/testing/evidence/import-platform/s4-*.json`
- `scripts/import-s4-register-td.mjs`

## Files modified (primary)

- `packages/database/src/schema/imports.ts`
- `packages/database/drizzle/meta/_journal.json`
- `packages/imports/src/index.ts`
- `apps/platform-api/src/modules/imports/imports.controller.ts`
- `apps/platform-api/src/modules/imports/imports.module.ts`
- `docs/api/import-openapi.yaml`
- `docs/operations/import-platform.md`
- `docs/project-status.md`

## Database changes

Migration **`0025_import_platform_s4_duplicates`** (additive):

- `import_duplicate_candidates`: match algorithm, confidence band, reasons,
  merge candidate JSON, review/candidate status, resolution metadata + indexes
- `import_profiles`: `duplicate_rules_json`, `zip_metadata_json`, `api_source_metadata_json`
- New table `import_profile_versions` with FORCE RLS + `forge_app` grants

## Infrastructure changes

| Item          | Value                                                                     |
| ------------- | ------------------------------------------------------------------------- |
| API image     | `import-s4-20260729124000`                                                |
| Digest        | `sha256:6880540581d75cda4369d6c0ec7b6f5c0fef8f47af19087e06f740d67460142e` |
| API TD        | `:34` → **`:35`** (stable, rollout COMPLETED)                             |
| Worker        | unchanged `:20`                                                           |
| Migrate task  | `e442b4aeb2dd447392845c9765c64851` exit **0** (admin secret)              |
| App DB secret | unchanged (`2026-07-26T15:30:16.387000-05:00`)                            |

No new CDK resources required for S4.

## Test results

| Suite                             | Result              |
| --------------------------------- | ------------------- |
| `@forge/imports` unit (27)        | PASS                |
| Health `GET /health`              | 200                 |
| Unauth duplicate/ZIP/API validate | 401                 |
| Migrate 0025                      | exit 0              |
| ECS API service                   | healthy / COMPLETED |

## Security review

- Tenant-scoped persistence + FORCE RLS on duplicate / profile version tables
- AuthN required on all new routes (smoke 401 without credentials)
- RBAC permissions on view / preview / approve / validate / profile.manage
- Sensitive field masking on duplicate API responses
- Cross-tenant visibility blocked by RLS + tenant ownership checks
- No critical findings in S4 scope; malware scanning remains S6

## Deployment evidence

- `docs/deployment/import-platform-s4-deployment.md`
- `docs/testing/evidence/import-platform/s4-image.json`
- `docs/testing/evidence/import-platform/s4-td-register.json`
- `docs/testing/evidence/import-platform/s4-deploy.json`
- `docs/testing/evidence/import-platform/s4-migrate.json`
- `docs/testing/evidence/import-platform/s4-smoke.json`

## Rollback notes

Revert API service to `forge-development-ecs-platform-api:34`.
Schema `0025` is additive; development does not require destructive schema rollback.

## Out of scope (deferred)

Worker execution, Step Functions, commits, rollback execution, malware (S6),
UI (S7), product adapters (Industrial / RMS / Academy).

## Known limitations

- ZIP validation prefers store-method entries for checksum/manifest reads in S4
- API framework validates config only — no live product connectors
- Duplicate detection requires caller-supplied `existingRecords` (adapter contract)
- Review approve/reject records intent only — does not merge/commit entities

## Recommendation for S5

Build the execution engine (queue/worker/Step Functions) consuming staged rows and
resolved duplicate review actions, still without product-specific commit logic in
the shared engine.

## Acceptance criteria checklist

| Criterion                                  | Status                            |
| ------------------------------------------ | --------------------------------- |
| Duplicate detection engine operational     | ✓                                 |
| Confidence scoring operational             | ✓                                 |
| Merge candidates generated (no auto-merge) | ✓                                 |
| ZIP validation operational                 | ✓                                 |
| External API import framework operational  | ✓                                 |
| Import profiles enhanced                   | ✓                                 |
| Duplicate review APIs deployed             | ✓                                 |
| OpenAPI updated                            | ✓                                 |
| Audit events generated                     | ✓                                 |
| RLS / cross-tenant isolation               | ✓ (schema FORCE RLS + auth smoke) |
| Documentation updated                      | ✓                                 |
| No critical security findings              | ✓                                 |
| ECS deployment healthy                     | ✓                                 |
| Health checks passing                      | ✓                                 |

**STOP:** Do not begin Sprint S5 until explicit ACCEPTED authorization.
