# Import Platform S6 - Deployment

**Date:** 2026-07-29  
**Status:** **COMPLETE**  
**Account:** 511343547817 (us-east-1, profile forge-dev)

## Results

| Item                             | Value                                                                     |
| -------------------------------- | ------------------------------------------------------------------------- |
| Image tag                        | `import-s6-20260729202056`                                                |
| Migration file                   | `packages/database/drizzle/0027_import_platform_s6_security.sql`          |
| Migration SHA256                 | `dfcefcbc5df866866e47babe2377dc71eee923f56d6c407d85b407647ec16601`        |
| API digest                       | `sha256:ee121aa53a77a8a8cde0a761d3684f77e13a4b44340602ee827c51aa8dc45e9f` |
| Worker digest                    | `sha256:9df1d452ed237bacf2ab35f84c4c0832efd6611798465655b591a107f4c28ab7` |
| Prior API TD                     | `:38` (S5)                                                                |
| Deployed API TD                  | `:39`                                                                     |
| Prior worker TD                  | `:23` (S5)                                                                |
| Deployed worker TD               | `:24`                                                                     |
| Migrate task                     | `.../1fd8a2e6b07647ea9dce3b6dd4dc0d2a`                                    |
| Migrate exit                     | **0** (admin secret `forge-development-secrets-database`)                 |
| Migration                        | `0027_import_platform_s6_security`                                        |
| Health GET                       | `200`                                                                     |
| POST .../execute unauth          | `401`                                                                     |
| POST .../results/download unauth | `401`                                                                     |
| POST .../files/.../rescan unauth | `401`                                                                     |
| App secret LastChangedDate       | unchanged `2026-07-26T15:30:16.387000-05:00`                              |

## Evidence

- `docs/testing/evidence/import-platform/s6-migration-checksum.json`
- `docs/testing/evidence/import-platform/s6-image.json`
- `docs/testing/evidence/import-platform/s6-td-register.json`
- `docs/testing/evidence/import-platform/s6-migrate.json`
- `docs/testing/evidence/import-platform/s6-smoke.json`

## Rollback

1. Revert API to `forge-development-ecs-platform-api:38`
2. Revert worker to `forge-development-ecs-worker-service:23`
3. Leave additive schema `0027` in place
4. Do not rotate or change `forge-development-secrets-database-app`

## Notes

- Migrate used admin secret only via `node scripts/run-ecs-migrate.mjs`
- App runtime secret `forge-development-secrets-database-app` was not rotated
- ECS cluster `forge-development-ecs-platform`; services `forge-development-ecs-platform-api` and `forge-development-ecs-worker-service` reached stable on new task definitions
