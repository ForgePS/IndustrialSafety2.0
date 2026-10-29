# Import Platform — Sprint S8 Baseline Inventory

**Inventory date:** 2026-07-29  
**Environment:** AWS development (`511343547817` / `us-east-1` / profile `forge-dev`)  
**AWS auth:** **OK** — `sts get-caller-identity` succeeded as  
`arn:aws:sts::511343547817:assumed-role/AWSReservedSSO_ForgeDeployAdmin_4e3cbf93096d93f3/forge-admin`  
**Prior sprint gate:** S7 ACCEPTED WITH DOCUMENTED UI LIMITATIONS (per S8 directive); S1–S6 ACCEPTED (S5/S6 with documented limitations / production restriction on reference scanner)

This baseline combines **live AWS inspection** with **repository / evidence / deployment docs**. Each section notes inspected vs documented.

---

## 1. API / worker ECS task definitions, images, digests

### Live ECS (inspected 2026-07-29)

| Service                                | Cluster                          | Task definition                           | Image tag                  | Desired/Running           |
| -------------------------------------- | -------------------------------- | ----------------------------------------- | -------------------------- | ------------------------- |
| `forge-development-ecs-platform-api`   | `forge-development-ecs-platform` | `forge-development-ecs-platform-api:39`   | `import-s6-20260729202056` | 1 / 1 (PRIMARY COMPLETED) |
| `forge-development-ecs-worker-service` | `forge-development-ecs-platform` | `forge-development-ecs-worker-service:24` | `import-s6-20260729202056` | 1 / 1 (PRIMARY COMPLETED) |

| Component | ECR repository                        | Digest (inspected + evidence)                                             |
| --------- | ------------------------------------- | ------------------------------------------------------------------------- |
| API       | `forge-development-ecr-platformapi`   | `sha256:ee121aa53a77a8a8cde0a761d3684f77e13a4b44340602ee827c51aa8dc45e9f` |
| Worker    | `forge-development-ecr-workerservice` | `sha256:9df1d452ed237bacf2ab35f84c4c0832efd6611798465655b591a107f4c28ab7` |

Full image URIs:

- `511343547817.dkr.ecr.us-east-1.amazonaws.com/forge-development-ecr-platformapi:import-s6-20260729202056`
- `511343547817.dkr.ecr.us-east-1.amazonaws.com/forge-development-ecr-workerservice:import-s6-20260729202056`

### Documented (S6/S7)

| Source                                                                                            | API TD          | Worker TD       | Tag / digests                    |
| ------------------------------------------------------------------------------------------------- | --------------- | --------------- | -------------------------------- |
| `docs/deployment/import-platform-s6-deployment.md` + `docs/testing/evidence/import-platform/s6-*` | `:39`           | `:24`           | tag + digests match live         |
| `docs/deployment/import-platform-s7-deployment.md`                                                | unchanged `:39` | unchanged `:24` | frontend-only; backend unchanged |

**Inspected vs documented:** Match. Live ECS/ECR confirm S6 images on `:39` / `:24`; S7 did not change backend.

---

## 2. Frontend deploy revisions (S7)

From `docs/deployment/import-platform-s7-deployment.md` (2026-07-29, status COMPLETE):

| App             | Deploy method                           | Bucket                                                       | CloudFront distribution | Invalidation ID              |
| --------------- | --------------------------------------- | ------------------------------------------------------------ | ----------------------- | ---------------------------- |
| Creator Console | `pnpm deploy:console --skip-build`      | `s3://forge-development-console-511343547817-us-east-1/`     | `EUY00O1FSF7BG`         | `IMLMHCLH1MMHB1G6F5Y5LB2JZ`  |
| Tenant Admin    | `pnpm deploy:tenant-admin --skip-build` | `s3://forge-development-tenantadmin-511343547817-us-east-1/` | `E3O4NP8GCEEK23`        | `I4EBJJB26ECNZTFXJJ67Z9FWCN` |

Smoke (documented): `/imports/` present in both `out/` folders.  
App secret `forge-development-secrets-database-app` LastChangedDate documented unchanged: `2026-07-26T15:30:16.387000-05:00`.

**Inspected vs documented:** Deployment write-up and S7 summary agree. Live `get-invalidation` for those IDs returned empty/null fields (CloudFront invalidation history retention / ID no longer queryable); treat S7 doc + summary as the revision record of record for S8 kickoff.

---

## 3. Migrations through 0027 (journal)

Source: `packages/database/drizzle/meta/_journal.json` (28 entries, idx 0–27).

| idx | tag                                                 |
| --- | --------------------------------------------------- |
| 0   | `0000_foundation`                                   |
| 1   | `0001_sprint_1d_platform_core`                      |
| 2   | `0002_app_role_rls`                                 |
| 3   | `0003_sprint_1e_membership_and_invitations`         |
| 4   | `0004_sprint_1e_idempotency_concurrency_onboarding` |
| 5   | `0005_sprint_1e_identity_resolution`                |
| 6   | `0006_identity_lookup_execute_grants`               |
| 7   | `0007_neris_schema_foundation`                      |
| 8   | `0008_neris_field_ordinal_unique`                   |
| 9   | `0009_rms_master_data`                              |
| 10  | `0010_neris_incident_shell`                         |
| 11  | `0011_neris_specialty_records`                      |
| 12  | `0012_neris_specialty_review`                       |
| 13  | `0013_cad_connections`                              |
| 14  | `0014_cad_messages_and_events`                      |
| 15  | `0015_cad_mapping`                                  |
| 16  | `0016_cad_webhook_lookup`                           |
| 17  | `0017_cad_incident_links_and_conflicts`             |
| 18  | `0018_cad_unit_personnel_mapping`                   |
| 19  | `0019_cad_operations_and_retention`                 |
| 20  | `0020_ai_narrative_foundation`                      |
| 21  | `0021_configuration_platform`                       |
| 22  | `0022_import_platform`                              |
| 23  | `0023_import_platform_s2_control_plane`             |
| 24  | `0024_import_platform_s3_upload`                    |
| 25  | `0025_import_platform_s4_duplicates`                |
| 26  | `0026_import_platform_s5_execution`                 |
| 27  | `0027_import_platform_s6_security`                  |

Import-platform migrations: **0022–0027**. Latest applied in S6 evidence: `0027_import_platform_s6_security` (migrate exit 0; SHA256 `dfcefcbc5df866866e47babe2377dc71eee923f56d6c407d85b407647ec16601`). S7: no migration.

**Inspected vs documented:** Journal matches S5/S6 summaries. Live DB ledger not re-queried in this inventory (evidence + journal used).

---

## 4. Import job / row states (code)

### Job statuses (`IMPORT_JOB_STATUSES` in `packages/imports/src/types.ts`)

`UPLOADED`, `SCANNING`, `SCAN_FAILED`, `READY_FOR_MAPPING`, `MAPPED`, `VALIDATING`, `VALIDATION_FAILED`, `READY_FOR_PREVIEW`, `PREVIEW_READY`, `AWAITING_APPROVAL`, `APPROVED`, `QUEUED`, `PROCESSING`, `COMPLETED`, `COMPLETED_WITH_ERRORS`, `FAILED`, `ROLLBACK_PENDING`, `ROLLED_BACK`, `ROLLBACK_REFUSED`, `CANCELLED`, `QUARANTINED`

### Row status (schema)

`import_rows.status` varchar default **`STAGED`** (`packages/database/src/schema/imports.ts`). Execution outcomes driven by adapter + `import_row_errors` / batch counters (no separate exported row-status enum in `@forge/imports` package surface beyond DB column).

**Inspected vs documented:** Code is source of truth; sprint summaries describe transitions but do not replace the enum list above.

---

## 5. Queue message contracts (`packages/imports`)

### `IMPORT_EXECUTE` — schemaVersion `"1"`

| Field            | Type                     |
| ---------------- | ------------------------ |
| `schemaVersion`  | `"1"`                    |
| `messageType`    | `"IMPORT_EXECUTE"`       |
| `jobId`          | uuid                     |
| `tenantId`       | uuid                     |
| `requestedBy`    | uuid \| null             |
| `correlationId`  | string 1–128             |
| `idempotencyKey` | string 1–255             |
| `attempt`        | int 1–100 (default 1)    |
| `requestedAt`    | ISO-8601 offset datetime |

Source: `packages/imports/src/execution/messages.ts`. Doc: `docs/architecture/import-platform/IMPORT_QUEUE_MESSAGE_CONTRACT.md`.

### `IMPORT_MALWARE_SCAN` — schemaVersion `"1"`

| Field           | Type                     |
| --------------- | ------------------------ |
| `schemaVersion` | `"1"`                    |
| `messageType`   | `"IMPORT_MALWARE_SCAN"`  |
| `jobId`         | uuid                     |
| `tenantId`      | uuid                     |
| `fileId`        | uuid                     |
| `correlationId` | string 1–128             |
| `requestedBy`   | uuid \| null             |
| `attempt`       | int 1–20 (default 1)     |
| `requestedAt`   | ISO-8601 offset datetime |

Source: `packages/imports/src/security/messages.ts`. Upload complete enqueues malware scan before format detect (S6).

### Upload detect — `import.upload.detect.v1`

| Field                         | Type                                    |
| ----------------------------- | --------------------------------------- |
| `type`                        | `"import.upload.detect.v1"`             |
| `version`                     | `1`                                     |
| `tenantId`, `jobId`, `fileId` | string                                  |
| `correlationId`               | string                                  |
| `actorUserId`                 | string \| null                          |
| `s3Bucket`, `s3Key`           | string                                  |
| `expectedFormat`              | `"csv"` \| `"xlsx"` \| `"json"` \| null |
| `enqueuedAt`                  | ISO-8601                                |

Source: `packages/imports/src/messages.ts`. Worker still routes this type; S6 path prefers malware-first enqueue after upload complete.

Forbidden in execute/malware messages (architecture doc): raw rows, secrets, credentials, presigned URLs, full mappings, tenant secrets.

**Inspected vs documented:** Code contracts match architecture docs for EXECUTE; malware contract is in package code (S6) more completely than older S5-only queue contract doc.

---

## 6. Retry / DLQ / batch defaults

### Application retry (`packages/imports/src/execution/retry.ts`)

| Setting       | Default                                                    |
| ------------- | ---------------------------------------------------------- |
| `maxAttempts` | 3                                                          |
| `baseDelayMs` | 1000                                                       |
| `maxDelayMs`  | 60_000                                                     |
| `jitterRatio` | 0.2                                                        |
| Retry when    | `failureClass === "RETRIABLE"` and `attempt < maxAttempts` |

### Scan defaults (`packages/imports/src/security/malware.ts`)

| Setting                         | Default |
| ------------------------------- | ------- |
| `DEFAULT_SCAN_TIMEOUT_MS`       | 120_000 |
| `DEFAULT_SCAN_POLL_INTERVAL_MS` | 1_000   |
| `DEFAULT_MAX_SCAN_ATTEMPTS`     | 3       |
| `DEFAULT_MAX_RESCANS`           | 5       |

### Batch (`packages/imports/src/execution/progress.ts`)

| Setting                        | Value |
| ------------------------------ | ----- |
| `DEFAULT_EXECUTION_BATCH_SIZE` | 50    |
| `MIN_EXECUTION_BATCH_SIZE`     | 1     |
| `MAX_EXECUTION_BATCH_SIZE`     | 500   |

DTO optional `batchSize` clamped 1–500 (`execution/dto.ts`).

### SQS imports queue (CDK + live)

| Setting                    | CDK (`forge-queues.ts`)             | Live inspected  |
| -------------------------- | ----------------------------------- | --------------- |
| Queue                      | `forge-development-sqs-imports`     | present         |
| Visibility timeout         | 5 minutes                           | 300 s           |
| Retention                  | 4 days                              | 345600 s        |
| DLQ                        | `forge-development-sqs-imports-dlq` | present         |
| `maxReceiveCount`          | 3                                   | 3               |
| DLQ retention              | 14 days                             | 1209600 s       |
| Encryption                 | KMS                                 | KMS key present |
| Approx messages (main/DLQ) | —                                   | 0 / 0           |

SFN ProcessBatch Retry (definition-only ASL): IntervalSeconds 2, MaxAttempts 3, BackoffRate 2.

**Inspected vs documented:** Live queue attributes match CDK `queuePair` defaults.

---

## 7. Scanner provider

| Item               | Value                                                                                                                   |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Provider key       | `reference-malware`                                                                                                     |
| Version            | `1`                                                                                                                     |
| Implementation     | `ReferenceMalwareScanner` (`packages/imports/src/security/reference-scanner.ts`)                                        |
| Behavior           | CLEAN unless EICAR SHA-256 or key/file signals (`eicar`, `__infected`, `__suspicious`, `__scan_timeout`, `__scan_fail`) |
| Production posture | **Dev/test only**; S6 ACCEPTED WITH PRODUCTION RESTRICTION — replace before high-risk tenant enablement                 |

**Inspected vs documented:** Code matches S6/S7 limitation tables and `IMPORT_MALWARE_SCANNING.md`.

---

## 8. Step Functions status

| Layer            | Finding                                                                                                                                      |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Package constant | `IMPORT_EXECUTION_SFN_STATUS = "DEFINITION_COMPLETE_DEPLOYMENT_PENDING"` (`packages/imports/src/execution/step-functions.ts`)                |
| Package ASL      | Includes `SecurityVerdictGate` (S6)                                                                                                          |
| CDK construct    | `ForgeImportExecutionStateMachine` in Messaging stack with `activate: false`; inline ASL **without** SecurityVerdictGate (S5-era Pass graph) |
| Live AWS         | `list-state-machines` → **[]**; Messaging stack resources → **no** `AWS::StepFunctions::StateMachine`                                        |
| Operational path | API → SQS → ECS worker                                                                                                                       |

**Inspected vs documented:** Status string matches docs. Live AWS confirms **no deployed state machine**. CDK source still synthesizes a construct, but the deployed Messaging stack does not currently contain an SFN resource — treat as definition-complete / deployment pending (not live-activated). Note ASL drift: package ASL (SecurityVerdictGate) ≠ CDK construct ASL.

---

## 9. Metrics, alarms, dashboards

### CDK (`infrastructure/cdk/lib/constructs/forge-monitoring.ts`)

| Alarm                                     | Metric                                           | Threshold         |
| ----------------------------------------- | ------------------------------------------------ | ----------------- |
| `forge-development-alarm-importsdlq`      | Imports DLQ `ApproximateNumberOfMessagesVisible` | ≥ 1               |
| `forge-development-alarm-imports-backlog` | Imports queue visible messages                   | ≥ 100 (3 periods) |

Dashboard widget: imports queue + imports DLQ visible message counts on overview dashboard.

No import-specific application EMF/custom metrics construct found in CDK beyond SQS queue metrics.

### Live CloudWatch (inspected)

| Alarm                                     | State |
| ----------------------------------------- | ----- |
| `forge-development-alarm-imports-backlog` | OK    |
| `forge-development-alarm-importsdlq`      | OK    |

Dashboards present: `ForgePlatform-Development-Overview`, `forge-development-configuration-platform`.

**Inspected vs documented:** Alarms exist in CDK and live; no dedicated “import security scan” alarm in CDK.

---

## 10. Backup configuration

| Item                  | Finding                                                                                                            |
| --------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Backup plan (live)    | `forge-development-backup-daily`                                                                                   |
| CDK `ForgeBackups`    | Selects Aurora cluster + documents + audit archive buckets                                                         |
| Imports S3 bucket     | **Not** in backup selection; lifecycle expiration via `retention.importFilesDays` (developer profile: **14 days**) |
| Imports bucket (live) | `forge-development-imports-511343547817-us-east-1` — SSE-KMS, versioning **Enabled**                               |

**Inspected vs documented:** Imports objects rely on S3 lifecycle + DB backups for job metadata; no dedicated AWS Backup selection for the imports bucket in CDK.

---

## 11. CDK constructs (queues, SFN, S3)

| Construct / stack                           | Role                                                                                                         |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `ForgeQueues` (`forge-queues.ts`)           | `imports` + `imports-dlq` KMS queues                                                                         |
| `MessagingStack`                            | Instantiates queues + `ForgeImportExecutionStateMachine` (`activate: false`)                                 |
| `ForgeImportExecutionStateMachine`          | Definition for future activation                                                                             |
| `ForgeBuckets.imports` (`forge-buckets.ts`) | Imports bucket + lifecycle (`importFilesDays`, abort MPU 3d)                                                 |
| `DataStack`                                 | Exposes `importsBucket`                                                                                      |
| `ForgeEcs`                                  | Grants API/worker R/W on imports bucket; env `S3_IMPORT_BUCKET`, `SQS_IMPORT_QUEUE_URL` / `IMPORT_QUEUE_URL` |
| `ForgeMonitoring`                           | Imports backlog + DLQ alarms                                                                                 |

---

## 12. Test coverage

### `@forge/imports` (ran 2026-07-29)

| Result     | Value                                                                                                |
| ---------- | ---------------------------------------------------------------------------------------------------- |
| Test files | 7 passed                                                                                             |
| Tests      | **44 passed / 0 failed**                                                                             |
| Suites     | S1 foundation, S2 control plane, S3 upload, S4 duplicates, S5 execution, S5 performance, S6 security |

### `@forge/import-center` (ran 2026-07-29)

| Result         | Value                                                                                                     |
| -------------- | --------------------------------------------------------------------------------------------------------- |
| Test files     | 1 passed                                                                                                  |
| Tests          | **8 passed / 0 failed**                                                                                   |
| Coverage areas | state router, permissions/filters, safe errors/download dispose unit helper, tenant cache clear, fixtures |

### Browser / Playwright

**None** for Import Center / Import Platform E2E in repo evidence for S7/S8 kickoff. `docs/testing/import-test-plan.md` still marks Playwright/a11y as planned.

**Inspected vs documented:** S7 claimed 8/8 import-center — confirmed. S5 claimed 38 `@forge/imports` tests — current package has **44** (S6 added security tests).

---

## 13. Performance results

| Result                                                                         | Source                                         |
| ------------------------------------------------------------------------------ | ---------------------------------------------- |
| 500 synthetic rows via `ReferenceImportAdapter` in &lt; 15s and &gt; 20 rows/s | `s5-performance.unit.test.ts` (passes locally) |
| Aurora-scale / multi-tenant load test                                          | **Not done** (S5/S6 limitation)                |

---

## 14. Production restrictions / acceptance gaps

| Restriction / gap                                                | Origin                                  |
| ---------------------------------------------------------------- | --------------------------------------- |
| `reference-malware@1` not production-ready for untrusted imports | S6 ACCEPTED WITH PRODUCTION RESTRICTION |
| Step Functions not activated                                     | S5–S7                                   |
| No product adapters / field catalogs                             | S5–S7                                   |
| Full rollback compensation not executed                          | S5–S7                                   |
| Aurora-scale validation missing                                  | S5–S6                                   |
| No Playwright / a11y evidence for Import Center                  | S7 → S8                                 |
| Override HTTP endpoint reserved / unavailable                    | S6–S7                                   |
| Quarantine release UI/API not productized                        | S6–S7                                   |
| Polling monitor only (3s)                                        | S7                                      |
| Narrow-screen mapping limited                                    | S7                                      |

Full register: `docs/imports/import-platform-open-limitations.md`.

---

## 15. Known limitations (S5 / S6 / S7 summaries)

### S5

- Step Functions not live-activated
- Reference adapter only
- Rollback compensation not executed (classification only)
- Perf bound for in-process reference adapter (500 rows), not Aurora
- Auth E2E execute smoke depends on tenant fixtures

### S6

- Reference scanner only (not multi-AV / GuardDuty)
- Product-specific sensitivity metadata incomplete
- Step Functions inactive
- Aurora-scale perf not load-tested
- Full rollback compensation deferred
- UI quarantine/sensitive review deferred to S7 (partially addressed by Import Center views; release/override still open)

### S7

- reference-malware@1
- SF inactive
- No product field catalogs
- Polling monitor (3s)
- Full rollback compensation not executed
- Narrow phone mapping limited

---

## 16. Inspected vs documented — summary

| Topic                                 | Documented                             | Inspected                   | Verdict                                            |
| ------------------------------------- | -------------------------------------- | --------------------------- | -------------------------------------------------- |
| API `:39` / worker `:24` + S6 digests | S6/S7 deploy docs + evidence           | Live ECS + ECR              | **Match**                                          |
| Frontend S7 CF invalidations          | S7 deploy doc                          | Invalidation API empty/null | **Doc is SoR**; live history expired/unavailable   |
| Migrations through 0027               | S6 + journal                           | Journal on disk             | **Match**                                          |
| Imports queue/DLQ defaults            | CDK                                    | Live attributes             | **Match**                                          |
| SFN                                   | DEFINITION_COMPLETE_DEPLOYMENT_PENDING | No live state machine       | **Consistent with pending**; CDK ASL ≠ package ASL |
| Import alarms                         | CDK monitoring                         | Live OK                     | **Match**                                          |
| Unit tests                            | S5/S7 summaries                        | Re-run 44 + 8               | **Match / updated count**                          |
| Browser E2E                           | Planned                                | None found                  | **Gap confirmed**                                  |

---

## Sources

- Live AWS: STS, ECS, ECR, SQS, CloudWatch alarms, CloudFormation stacks/resources, S3 encryption/versioning, Backup plans, Step Functions list
- Evidence: `docs/testing/evidence/import-platform/s6-*`
- Deploy: `docs/deployment/import-platform-s6-deployment.md`, `docs/deployment/import-platform-s7-deployment.md`
- Summaries: `docs/sprints/IMPORT-PLATFORM-S5-summary.md`, `S6`, `S7`
- Code: `packages/imports`, `packages/import-center`, `packages/database/drizzle`, `infrastructure/cdk`
