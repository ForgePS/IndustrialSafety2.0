# Import Platform S4 — Deployment

**Date:** 2026-07-29  
**Status:** **COMPLETE**

## Results

| Item                                               | Value                                                                     |
| -------------------------------------------------- | ------------------------------------------------------------------------- |
| Image tag                                          | `import-s4-20260729124000`                                                |
| API digest                                         | `sha256:6880540581d75cda4369d6c0ec7b6f5c0fef8f47af19087e06f740d67460142e` |
| Prior API TD                                       | `:34`                                                                     |
| Deployed API TD                                    | `:35`                                                                     |
| Worker TD                                          | unchanged `:20` (S4 is API-side)                                          |
| Migrate task                                       | `…/e442b4aeb2dd447392845c9765c64851`                                      |
| Migrate exit                                       | **0** (admin secret)                                                      |
| Migration                                          | `0025_import_platform_s4_duplicates`                                      |
| Health                                             | `200`                                                                     |
| `GET /api/v1/imports/duplicates` unauth            | `401`                                                                     |
| `POST /api/v1/imports/zip/validate` unauth         | `401`                                                                     |
| `POST /api/v1/imports/api-sources/validate` unauth | `401`                                                                     |
| App secret LastChangedDate                         | unchanged `2026-07-26T15:30:16.387000-05:00`                              |

## Evidence

- `docs/testing/evidence/import-platform/s4-image.json`
- `docs/testing/evidence/import-platform/s4-deploy.json`
- `docs/testing/evidence/import-platform/s4-migrate.json`
- `docs/testing/evidence/import-platform/s4-smoke.json`
- `docs/testing/evidence/import-platform/s4-td-register.json`

## Rollback

Revert API to `forge-development-ecs-platform-api:34`. Schema `0025` is additive (new columns/table); no destructive rollback required for development.
