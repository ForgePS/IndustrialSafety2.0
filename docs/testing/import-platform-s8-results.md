# Import Platform S8 — Test Results

**Document:** `docs/testing/import-platform-s8-results.md`  
**Date:** 2026-07-29  
**Honesty rule:** Only record verified evidence. Do **not** invent Aurora/E2E browser pass counts.

## Summary verdict

| Area                                                 | Result                                                                                   |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Unit production guards / stuck / batch               | **VERIFIED** — `@forge/imports` 49 passed (incl. S8 hardening)                           |
| Import Center unit                                   | **VERIFIED** — 9 passed (incl. banner export)                                            |
| DLQ inspect (development)                            | **VERIFIED empty** + tooling exercised                                                   |
| CloudWatch import alarms (backlog/DLQ)               | **VERIFIED OK**                                                                          |
| Import CloudWatch dashboards (CLI put)               | **VERIFIED published** (5 dashboards)                                                    |
| ADRs (malware Outcome B, SFN Option B)               | **VERIFIED** accepted decision docs                                                      |
| Aurora multi-size / 250k                             | **NOT EXECUTED** — protocol only                                                         |
| Playwright / browser a11y E2E                        | **NOT EXECUTED** — requirements documented                                               |
| Full live permission HTTP matrix                     | **PENDING** controlled-env evidence                                                      |
| ECS RLS re-verify this session                       | **VERIFIED** — 45/45 passed (`docs/testing/evidence/import-platform/s8-rls-verify.json`) |
| S8 CLI alarms (queue-age / worker / scanner-blocked) | **CREATED** (INSUFFICIENT_DATA until metrics flow)                                       |
| S8 API/worker/frontend image deploy                  | **VERIFIED** — API `:40` / worker `:25` / frontends invalidated                          |

## Verified evidence

### 1. Unit guards (`@forge/imports`)

Source: `packages/imports/src/s8-hardening.unit.test.ts` + `production-guards.ts`

| Assertion                                                           | Status  |
| ------------------------------------------------------------------- | ------- |
| Reference scanner allowed in development/testing                    | Covered |
| Reference scanner blocked in staging/production/govcloud-production | Covered |
| Non-reference provider allowed in production                        | Covered |
| Stuck job threshold for SCANNING                                    | Covered |
| `S8_BATCH_RECOMMENDATION` default 50 / max 500                      | Covered |

Prior package suites (S1–S6) remain regression baseline. S8 baseline inventory re-ran `@forge/imports` at **44 passed** and `@forge/import-center` at **8 passed** (2026-07-29 kickoff counts). Re-record exact counts on acceptance CI run if they change.

### 2. DLQ ops

Tool: `scripts/import-dlq-ops.mjs`  
Baseline: development imports queue / DLQ approximate messages **0 / 0**.  
Inspect mode is the safe default; Body redaction is by design.

### 3. Alarms

| Alarm                                     | State at baseline |
| ----------------------------------------- | ----------------- |
| `forge-development-alarm-imports-backlog` | OK                |
| `forge-development-alarm-importsdlq`      | OK                |

### 4. Architecture decisions

| ADR              | Decision                   | Status   |
| ---------------- | -------------------------- | -------- |
| Malware provider | Outcome B production block | ACCEPTED |
| Step Functions   | Option B keep SQS→ECS      | ACCEPTED |

### 5. Schema / path

| Item                         | Verified                      |
| ---------------------------- | ----------------------------- |
| Migrations through `0027`    | Journal + S6 evidence         |
| Operational path API→SQS→ECS | Live: no import state machine |
| FORCE RLS on import tables   | Migrations 0022–0027          |

## Remains controlled-env evidence (PENDING)

| Item                                               | Why pending                                                       |
| -------------------------------------------------- | ----------------------------------------------------------------- |
| Aurora multi-tenant matrix (500 / 5k / 50k / 250k) | No controlled run executed in S8 docs phase — see performance doc |
| Full HTTP permission matrix against live roles     | Needs fixture users in target env                                 |
| Browser a11y (keyboard + axe)                      | Playwright suite not greenfield                                   |
| Tenant-switch cache browser proof                  | LIM-IMP-012                                                       |
| Protected download browser proof                   | LIM-IMP-013                                                       |
| Presigned URL disposal browser proof               | LIM-IMP-014                                                       |
| Controlled Aurora PITR + S3 version restore drill  | Backup runbook placeholders                                       |

## Explicit non-results (do not cite as pass)

- Aurora **250k** row import throughput
- Multi-AZ / cross-region RTO measurements
- “Playwright 100% a11y pass”
- Product adapter E2E
- Live Step Functions execution

## Sign-off

| Role        | Name | Date | Notes                         |
| ----------- | ---- | ---- | ----------------------------- |
| Engineering |      |      | Attach CI logs when available |
| Ops         |      |      | Confirm alarm/DLQ snapshot    |
| Acceptance  |      |      | May accept with PENDING list  |
