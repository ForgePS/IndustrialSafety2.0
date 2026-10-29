# Import Platform S7 - Deployment

**Date:** 2026-07-29
**Status:** **COMPLETE**
**Account:** 511343547817 (us-east-1, profile forge-dev)

## Scope

Frontend-only static sync for Import Center UI (@forge/import-center). No API/worker image rebuild, no ECS task definition change, no database migration.

## Results

| Item                         | Value                                                      |
| ---------------------------- | ---------------------------------------------------------- |
| Creator Console deploy       | pnpm deploy:console --skip-build                           |
| Console bucket               | s3://forge-development-console-511343547817-us-east-1/     |
| Console CloudFront           | EUY00O1FSF7BG invalidation IMLMHCLH1MMHB1G6F5Y5LB2JZ       |
| Tenant Admin deploy          | pnpm deploy:tenant-admin --skip-build                      |
| Tenant Admin bucket          | s3://forge-development-tenantadmin-511343547817-us-east-1/ |
| Tenant Admin CloudFront      | E3O4NP8GCEEK23 invalidation I4EBJJB26ECNZTFXJJ67Z9FWCN     |
| Smoke out/imports/index.html | present (console + tenant-admin)                           |
| Backend API TD               | unchanged :39                                              |
| Backend worker TD            | unchanged :24                                              |
| App secret LastChangedDate   | unchanged 2026-07-26T15:30:16.387000-05:00                 |

## Verification

- @forge/import-center tests: 8/8 passed
- @forge/import-center build: pass
- creator-console and tenant-admin tsc --noEmit + next build: pass
- Route /imports in both static exports

## Fixes applied before deploy

- safe-error.ts: escaped s3 URI regex so unit tests run
- api.ts / ImportCenterApp.tsx: exactOptionalPropertyTypes call-site fixes

## Rollback

1. Re-sync prior console/tenant-admin static artifacts if needed
2. Do not rotate or change forge-development-secrets-database-app
3. Leave API :39 / worker :24 as-is (S7 did not change backend)

## Notes

- Deploy used existing local out/ builds (--skip-build)
- Default AWS profile session was expired; deploy used AWS_PROFILE=forge-dev
