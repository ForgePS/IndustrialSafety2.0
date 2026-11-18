# Import Platform S2 — Deployment

**Date:** 2026-07-29  
**Status:** **COMPLETE**

## Results

| Item                               | Value                                                                     |
| ---------------------------------- | ------------------------------------------------------------------------- |
| Image tag                          | `import-s2-20260729072334`                                                |
| Digest                             | `sha256:017657bc49ea9cf8b9eb5613a8d7439bfb69e86d97dd97386bea44183e71d208` |
| Prior API TD                       | `:32`                                                                     |
| Deployed API TD                    | `:33`                                                                     |
| Worker                             | `:19` unchanged                                                           |
| Migrate task                       | `…/8aed438a360a481aba57097a3a451c1c`                                      |
| Migrate exit                       | **0**                                                                     |
| Health                             | `200` healthy                                                             |
| `/api/v1/imports/templates` unauth | `401` (route present)                                                     |
| App secret LastChangedDate         | unchanged `2026-07-26T15:30:16.387000-05:00`                              |

## Evidence

- `docs/testing/evidence/import-platform/s2-image.json`
- `docs/testing/evidence/import-platform/s2-deploy.json`
- `docs/testing/evidence/import-platform/s2-migrate.json`
- `docs/testing/evidence/import-platform/s2-smoke.json`

## Rollback

Revert API service to `forge-development-ecs-platform-api:32`. Worker untouched. Schema `0023` is additive.
