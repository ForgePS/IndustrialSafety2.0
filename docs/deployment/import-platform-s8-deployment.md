# Import Platform S8 - Deployment

**Date:** 2026-07-29  
**Status:** **COMPLETE** (development)  
**Account:** 511343547817 (us-east-1, profile forge-dev)

## Results

| Item                              | Value                                                                     |
| --------------------------------- | ------------------------------------------------------------------------- |
| Image tag                         | `import-s8-20260729182259`                                                |
| API digest                        | `sha256:f86fef9e8be4969f88e72d201323f07286d504cb097f7b575e59ea309d77935b` |
| Worker digest                     | `sha256:e4472318107466d4ad4a40032d73a8aaa81b338fa8e262ad4b74e19578def557` |
| Prior API TD                      | `:39` (S6)                                                                |
| Deployed API TD                   | `:40`                                                                     |
| Prior worker TD                   | `:24` (S6)                                                                |
| Deployed worker TD                | `:25`                                                                     |
| Migration                         | none (baseline remains `0027`)                                            |
| Health GET                        | `200`                                                                     |
| GET `/api/v1/imports/jobs` unauth | `401`                                                                     |
| App secret LastChangedDate        | unchanged `2026-07-26T15:30:16.387000-05:00`                              |
| Creator Console invalidation      | `I8UZZFUXPH6FL4IJ8FUO0G9T2V` (`EUY00O1FSF7BG`)                            |
| Tenant Admin invalidation         | `IAH6SN8BJR1LDYH66PSIDNGEAC` (`E3O4NP8GCEEK23`)                           |

## What shipped in this deploy

- Production scanner Outcome B guards (API upload + worker malware)
- Import Center production restriction banner (`appEnv`)
- Stuck-job helpers / batch recommendation constants (package)
- No schema migration

## Evidence

- `docs/testing/evidence/import-platform/s8-image.json`
- `docs/testing/evidence/import-platform/s8-td-register.json`
- `docs/testing/evidence/import-platform/s8-deploy.json`
- `docs/testing/evidence/import-platform/s8-rls-verify.json` (pre-deploy)
- `docs/testing/evidence/import-platform/s8-smoke.json`

## Rollback

1. Revert API to `forge-development-ecs-platform-api:39`
2. Revert worker to `forge-development-ecs-worker-service:24`
3. Re-sync prior console/tenant-admin static artifacts if needed
4. Leave additive schema `0027` in place
5. Do not rotate or change `forge-development-secrets-database-app`

## Notes

- Deployed to **development** only; no laptop production deploy
- CDK monitoring construct changes are in-repo; CLI alarms already created for queue-age / worker / scanner-blocked
