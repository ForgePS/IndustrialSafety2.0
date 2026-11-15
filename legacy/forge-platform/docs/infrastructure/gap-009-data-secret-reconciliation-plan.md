# GAP-009 — Data Stack Application Secret Reconciliation Plan

**Status:** APPROVAL_READY (not deployed)  
**Date:** 2026-07-27  
**Account:** 511343547817  
**Region:** us-east-1  
**Protected secret:** `forge-development-secrets-database-app`  
**Runtime role:** `forge_app`  
**Phase 4:** Not started

---

## 1. Current state

### Secrets Manager (application)

| Field                    | Value (sanitized)                                                                                    |
| ------------------------ | ---------------------------------------------------------------------------------------------------- |
| Name                     | `forge-development-secrets-database-app`                                                             |
| ARN                      | `arn:aws:secretsmanager:us-east-1:511343547817:secret:forge-development-secrets-database-app-SknUu5` |
| Description              | Aurora forge_app runtime credentials for API and worker                                              |
| CreatedDate              | 2026-07-26T15:30:16-05:00                                                                            |
| LastChangedDate          | 2026-07-26T15:30:16-05:00                                                                            |
| KMS                      | Default AWS-managed (KmsKeyId null)                                                                  |
| Resource policy          | None                                                                                                 |
| Rotation                 | Disabled / none                                                                                      |
| Tags                     | None                                                                                                 |
| Replication              | None                                                                                                 |
| DeletedDate              | null (not scheduled for deletion)                                                                    |
| CloudFormation ownership | **None** — not present in `Forge-Development-Data` stack resources                                   |

### Secrets Manager (admin / migration)

| Field          | Value                                 |
| -------------- | ------------------------------------- |
| Name           | `forge-development-secrets-database`  |
| ARN suffix     | `…database-b2BejX`                    |
| CFN logical ID | `DatabaseDbSecret1098DC6E`            |
| Ownership      | **Owned by** `Forge-Development-Data` |

### ECS references

| Service                                | Cluster                          | Task definition     | Env                   | Value (prefix)                                    |
| -------------------------------------- | -------------------------------- | ------------------- | --------------------- | ------------------------------------------------- |
| `forge-development-ecs-platform-api`   | `forge-development-ecs-platform` | `:16` (1/1 HEALTHY) | `DATABASE_SECRET_ARN` | `…:secret:forge-development-secrets-database-app` |
| `forge-development-ecs-worker-service` | same                             | revision 14         | `DATABASE_SECRET_ARN` | same name prefix                                  |

Compute resolves the app secret via `Secret.fromSecretNameV2` in `ComputeStack` (GAP-009 workaround). Runtime username expected: `forge_app`.

### Aurora

| Field                        | Value                                                           |
| ---------------------------- | --------------------------------------------------------------- |
| Cluster                      | `forge-development-rds-aurora` (available)                      |
| Database                     | `forge_platform`                                                |
| Master username              | `forge_admin`                                                   |
| App role                     | `forge_app` (FORCE RLS subject)                                 |
| Admin secret                 | `forge-development-secrets-database` (CFN-managed)              |
| App secret                   | `forge-development-secrets-database-app` (external)             |
| SG                           | `sg-0f117aede3d003d00`                                          |
| Restore                      | PITR available; recent AWS Backup + automated snapshots present |
| Earliest / latest restorable | ~2026-07-25 → 2026-07-27 (sampled)                              |

### Data stack CDK / CFN

| Field              | Value                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------- |
| Stack name         | `Forge-Development-Data` (construct id `ForgeData`)                                   |
| Status             | `UPDATE_ROLLBACK_COMPLETE` (failed prior update rolled back)                          |
| Construct path     | `ForgeData` → `Database` (`ForgeDatabase`) → `AppDbSecret`                            |
| Prior behavior     | `new secretsmanager.Secret(..., secretName: forge-*-secrets-database-app)`            |
| Failure mode       | `AlreadyExists` on create → rollback                                                  |
| Compute dependency | Compute depends on Data; normal Compute deploy without `--exclusively` re-enters Data |

### Pre-deploy health (2026-07-27 ~06:10–11:12 CDT)

| Check                                | Result                                              |
| ------------------------------------ | --------------------------------------------------- |
| STS account                          | 511343547817                                        |
| API health                           | 200                                                 |
| RMS                                  | 200                                                 |
| API task `:16`                       | HEALTHY 1/1                                         |
| CloudTrail logging                   | true (LatestDeliveryTime 2026-07-27T06:10:56-05:00) |
| api-5xx / api-cf-5xx / running-tasks | OK                                                  |
| App secret LastChangedDate           | unchanged                                           |

---

## 2. Root cause

The application secret was created **outside** CloudFormation ownership (Phase 2 `forge_app` provisioning) with the same physical name that `ForgeDatabase` later tried to **create** on Data stack update. CloudFormation cannot create a secret that already exists → `AlreadyExists` → `UPDATE_ROLLBACK_COMPLETE`. Compute was patched to import by name and deploy with `--exclusively`, leaving Data unable to update safely.

---

## 3. Selected strategy

### Strategy A — Import by name (`Secret.fromSecretNameV2`) — **SELECTED**

When `config.database.importExistingAppSecret === true` (development):

```typescript
this.appSecret = secretsmanager.Secret.fromSecretNameV2(
  this,
  "AppDbSecret",
  resourceName(config, "secrets", "database-app"),
);
```

Effects:

- No `AWS::SecretsManager::Secret` for `database-app` in the Data template
- No create / replace / delete of the protected secret
- ARN and value unchanged
- ECS continues using the same name/ARN prefix
- Greenfield environments keep `importExistingAppSecret: false` (create path retained)

**Evidence:** In-process synth shows `contains-database-app=false`, `contains-AppDbSecret=false`. Live `cdk diff ForgeData` → **0 differences** (template now matches deployed reality: only admin secret managed).

---

## 4. Rejected strategies

| Strategy                        | Decision         | Why                                                                                                                                            |
| ------------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| B — CFN resource import         | Rejected for now | App secret never existed as a stack resource; import would adopt lifecycle (risk of future delete/replace). Not needed for reference-only use. |
| C — Foundational secrets stack  | Rejected for now | Extra stack churn without reducing risk vs name import; can revisit later.                                                                     |
| D — Parameterized external only | Partial overlap  | Config flag documents ownership; Strategy A implements the reference. Pure Parameter Store ARN would still need IAM wiring.                    |

---

## 5. CDK changes (implemented; not deployed)

| File                                         | Change                                             |
| -------------------------------------------- | -------------------------------------------------- |
| `lib/config/environment-schema.ts`           | `database.importExistingAppSecret` (default false) |
| `lib/config/development.ts`                  | `importExistingAppSecret: true`                    |
| `lib/constructs/forge-database.ts`           | Import-by-name vs create branch; ownership docs    |
| `bin/forge-platform.ts`                      | Comment: do not pass created AppDbSecret export    |
| `test/gap-009-app-secret-protection.test.ts` | Protection tests                                   |
| `test/data-stack.test.ts`                    | Assert no protected secret create                  |
| `test/compute-stack.test.ts`                 | Missing Cognito/origin props restored (suite load) |

---

## 6. CloudFormation implications

- **Deployed Data stack today:** Already has no AppDbSecret resource (create never succeeded).
- **After code change synth:** Still no AppDbSecret resource → **empty Data diff**.
- **Deploy of Data (when approved):** Expected to be a no-op or only unrelated pending changes; must re-run `cdk diff ForgeData` immediately before deploy and abort if any secret create/replace/delete appears.
- **Do not** flip `importExistingAppSecret` from `false`→`true` on a stack that already owns AppDbSecret without an approved import/orphan plan (would delete the CFN resource).

---

## 7. Secret ownership (target)

| Secret                         | Owner                                          | Notes                                                         |
| ------------------------------ | ---------------------------------------------- | ------------------------------------------------------------- |
| `forge-*-secrets-database`     | Data CDK / CFN                                 | Admin / migrate                                               |
| `forge-*-secrets-database-app` | **External / operational** (referenced by CDK) | Runtime `forge_app`; not CFN-lifecycle-managed in development |

---

## 8. ECS dependencies

No ECS task definition change required. Keep `DATABASE_SECRET_ARN` pointing at `forge-*-secrets-database-app`. Do not regenerate password. Do not change task revision solely for this reconciliation.

---

## 9. Aurora dependencies

No Aurora cluster or password change. Admin secret remains CFN-managed. App role `forge_app` unchanged. Recovery points available before any Data deploy.

---

## 10. Deployment commands (after approval only)

```bash
export AWS_PROFILE=forge-dev
export AWS_REGION=us-east-1
export CDK_DEFAULT_ACCOUNT=511343547817
export CDK_DEFAULT_REGION=us-east-1

cd infrastructure/cdk
pnpm test
pnpm typecheck
pnpm lint
pnpm nag
pnpm exec cdk diff ForgeData
# STOP if diff shows Secrets Manager create/replace/delete for database-app

pnpm exec cdk deploy ForgeData --exclusively --require-approval broadening
# Monitor CFN events; abort on secret replacement

pnpm exec cdk diff ForgeData   # expect stable / empty for secret section
```

Do **not** deploy unrelated stacks in the same command. Do **not** deploy Data until this plan is approved.

---

## 11. Pre-deployment checks

- [ ] Account 511343547817 / region us-east-1
- [ ] SSO active (`aws sts get-caller-identity`)
- [ ] API `:16` healthy; API/RMS 200
- [ ] CloudTrail logging; review alarms
- [ ] Record app secret ARN + LastChangedDate
- [ ] Record ECS `DATABASE_SECRET_ARN`
- [ ] Confirm Aurora restore window / snapshot
- [ ] `cdk diff ForgeData` non-destructive for secrets
- [ ] Human approval recorded

---

## 12. Rollback plan

1. **If Data deploy fails mid-update:** Allow CloudFormation rollback (stack previously recovered from `UPDATE_ROLLBACK_COMPLETE` pattern).
2. **If secret were ever targeted (must not happen):** Stop immediately; do not delete/rotate; restore connectivity by confirming ECS still references existing ARN; engage break-glass only with separate authorization.
3. **Code rollback:** Revert CDK commit; Compute exclusive deploy path remains available.
4. **Aurora:** Restore from PITR / AWS Backup only if database corruption (not expected for secret-reference-only change).

Expected downtime for empty/no-op Data deploy: **none**.

---

## 13. Post-deployment verification

- Secret ARN unchanged; LastChangedDate unchanged
- No rotation events
- ECS env still `…database-app`; API HEALTHY; health 200
- `forge_app` runtime; FORCE RLS; tenant-isolation + Phase 3 smoke
- `cdk diff ForgeData` no longer proposes AppDbSecret create
- CloudWatch / CloudTrail OK

---

## 14. Risks

| Risk                                                           | Severity | Mitigation                                         |
| -------------------------------------------------------------- | -------- | -------------------------------------------------- |
| Accidental future create path in shared envs                   | Medium   | Flag default false; protection tests; review diffs |
| Flipping import→create ownership wrongly                       | High     | Documented ban; approval gate                      |
| Unrelated Data drift on first successful update after rollback | Medium   | Exclusive Data deploy; inspect full diff           |
| SSO directory alarm noise                                      | Low      | Known from operator login                          |

---

## 15. Cost impact

Negligible — no new resources; reference-only change.

---

## 16. Human approval gate

**Do not deploy `Forge-Development-Data` until explicitly approved.**

### Approval request summary

| Item                          | Statement                                            |
| ----------------------------- | ---------------------------------------------------- |
| CDK diff (sampled 2026-07-27) | **0 differences** for ForgeData / Network / Security |
| Resources added               | None (expected)                                      |
| Resources modified            | None (expected)                                      |
| Resources replaced            | None                                                 |
| Resources deleted             | None                                                 |
| Secret value unchanged        | Yes (not managed / not rotated)                      |
| Secret ARN unchanged          | Yes                                                  |
| Aurora replaced               | No                                                   |
| ECS runtime references valid  | Yes (`:16` HEALTHY)                                  |
| Rollback                      | CFN rollback + code revert; secret untouched         |
| Expected downtime             | None                                                 |
| Expected cost                 | ~$0 incremental                                      |

**Approver:** _________________  
**Date:** _________________  
**Decision:** APPROVE DATA DEPLOY / REJECT / DEFER

---

## Appendix — Validation already run (pre-approval)

| Check                                             | Result                                                   |
| ------------------------------------------------- | -------------------------------------------------------- |
| Unit tests (gap-009 + data-stack + compute-stack) | PASS                                                     |
| Full vitest (after compute fix)                   | Re-run recommended before deploy                         |
| typecheck / lint                                  | PASS                                                     |
| cdk-nag                                           | Completed (existing RDS writer StorageEncrypted warning) |
| cdk synth (in-process evidence)                   | No `database-app` / `AppDbSecret` resources              |
| cdk diff ForgeData                                | 0 differences                                            |
