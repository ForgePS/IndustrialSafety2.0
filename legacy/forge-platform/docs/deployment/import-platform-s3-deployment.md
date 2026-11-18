# Import Platform S3 — Deployment

**Date:** 2026-07-29  
**Status:** **COMPLETE**

## Results

| Item                                 | Value                                                                     |
| ------------------------------------ | ------------------------------------------------------------------------- |
| Image tag                            | `import-s3-20260729092615`                                                |
| API digest                           | `sha256:74e311dd98cee2562447c3ec8fa5681966e8e6d94326e65ab7d871a6a2c55b87` |
| Worker digest                        | `sha256:d6dd11473484eaaae7e54974cf74994ed447c57b60db373d03acb0b1df937bac` |
| Prior API TD                         | `:33`                                                                     |
| Deployed API TD                      | `:34`                                                                     |
| Prior worker TD                      | `:19`                                                                     |
| Deployed worker TD                   | `:20` (added `S3_IMPORT_BUCKET`)                                          |
| Migrate task                         | `…/de1a4227562045d1855848411d3df22b`                                      |
| Migrate exit                         | **0** (admin secret)                                                      |
| Health                               | `200`                                                                     |
| `POST /api/v1/imports/upload` unauth | `401`                                                                     |
| App secret LastChangedDate           | unchanged `2026-07-26T15:30:16.387000-05:00`                              |

## Evidence

- `docs/testing/evidence/import-platform/s3-image.json`
- `docs/testing/evidence/import-platform/s3-deploy.json`
- `docs/testing/evidence/import-platform/s3-migrate.json`
- `docs/testing/evidence/import-platform/s3-smoke.json`
- `docs/testing/evidence/import-platform/s3-td-register.json`

## Rollback

Revert API to `forge-development-ecs-platform-api:33` and worker to `:19`. Schema `0024` is additive.
