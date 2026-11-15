# Import Platform S5 — Deployment

**Date:** 2026-07-29  
**Status:** **COMPLETE**

## Results

| Item                       | Value                                                                                   |
| -------------------------- | --------------------------------------------------------------------------------------- |
| Image tag                  | `import-s5-20260729135433`                                                              |
| API digest                 | `sha256:4fc9acf08b09d9e8a15cc9125565a6aa10953aa81b69cd17c7a4347082d051cc`               |
| Worker digest              | `sha256:d42a2ffdb25dbcbfab3aed99d0ee783f14d5796951971f85c8fa235c77921cd3`               |
| Prior API TD               | `:35` (S4 accepted)                                                                     |
| Deployed API TD            | `:38`                                                                                   |
| Prior worker TD            | `:20`                                                                                   |
| Deployed worker TD         | `:23`                                                                                   |
| Migrate task               | `…/ac76fbaf51cf40ba8d7616bc4388d691` (also observed `463a91b219424019970405cd1757f1ea`) |
| Migrate exit               | **0** (admin secret)                                                                    |
| Migration                  | `0026_import_platform_s5_execution`                                                     |
| Step Functions             | **DEFINITION_COMPLETE_DEPLOYMENT_PENDING**                                              |
| Health                     | `200`                                                                                   |
| `POST .../execute` unauth  | `401`                                                                                   |
| `GET .../status` unauth    | `401`                                                                                   |
| App secret LastChangedDate | unchanged `2026-07-26T15:30:16.387000-05:00`                                            |
| Unit tests                 | 38 passed (`@forge/imports`)                                                            |

## Evidence

- `docs/testing/evidence/import-platform/s5-image.json`
- `docs/testing/evidence/import-platform/s5-td-register.json`
- `docs/testing/evidence/import-platform/s5-deploy.json`
- `docs/testing/evidence/import-platform/s5-migrate.json`
- `docs/testing/evidence/import-platform/s5-smoke.json`

## Rollback

1. Revert API to `forge-development-ecs-platform-api:35`
2. Revert worker to `forge-development-ecs-worker-service:20`
3. Leave additive schema `0026` in place
4. Preserve QUEUED/PROCESSING jobs; clear stale locks via `execution_lock_expires_at`
5. Do not auto-redrive DLQ

## IAM notes (no new wildcards)

Worker retains existing SQS consume + S3 imports + secrets/logging grants from Compute stack. Step Functions IAM is defined in CDK construct but not activated in live Messaging deploy this sprint.
