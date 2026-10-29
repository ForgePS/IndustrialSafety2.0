# NERIS Phase 3 — Final Acceptance Report

**Decision:** `ACCEPTED`  
**Report date:** 2026-07-26 (limitation closeout)  
**Environment:** AWS development (`511343547817` / `us-east-1`)  
**Prepared by:** Engineering (agent-assisted closeout)  
**Phase 4:** Not started (explicit stop)

---

## 1. Executive summary

Phase 3 specialty workflows completed limitation closeout on the preserved Forge-Development-Compute deployment (API task revision **16**). Dedicated Cognito Playwright suites for scenarios **2–9**, the attachment matrix, specialty mobile viewports, and specialty accessibility checks all **PASS**. Full RMS e2e regression is **34/34 passed** (20 `@phase3` + Phase 2 suite). Product owner sign-off is still required below (not forged).

---

## 2. Phase decision

| Decision                  | Selected                                 |
| ------------------------- | ---------------------------------------- |
| **ACCEPTED**              | **Yes — engineering evidence gates met** |
| ACCEPTED_WITH_LIMITATIONS | No — scenarios 2–9 and matrices closed   |
| INCOMPLETE                | No                                       |

**Engineering gates satisfied:** scenarios 1–10 PASS; attachment, cross-tenant, restricted casualty, finalization, and feature-disabled tests PASS; no Critical/Serious a11y findings in deployed specialty suite; Playwright required tests zero skips/failures; Phase 2 regression PASS; API/RMS healthy after testing.

**Human product status:** Product owner must still sign the section below. Until that signature exists, operational release judgment remains with Jeremy Powell.

---

## 3. Scope completed

- Specialty workflow engine (14 groups) + live form descriptor + section API
- Feature flag default false; override only `rms-synthetic-fd`
- Repeatable records, attachments (quarantine-default scanner), occupancy/preplan, proposals
- Specialty validation, permissions, casualty masking + access audit
- Specialty review UI/API
- GAP-009 Compute deploy path preserved (no Data stack deploy)
- Migrations `0011` / `0012` preserved; runtime `forge_app`; app secret unchanged
- Playwright Phase 3 scenarios 1–10 + attachment/mobile/a11y matrices

---

## 4. Scope deferred

CAD, external NERIS submit, offline sync, AI narrative, ePCR, IRWIN, production onboarding, SOC 2 Type 1/2 claims, deployed malware clearing service (quarantine-only remains an operational limitation), GAP-009 Data stack import.

---

## 5. Workflow groups completed

All 14 groups remain implemented in `@forge/neris`. Deployed Cognito scenarios exercised FIRE/STRUCTURE/EXPOSURES, CIVILIAN_CASUALTIES, FIRE_SERVICE_CASUALTIES, HAZMAT, ALARM_DETECTION, FIRE_PROTECTION activation and review paths.

---

## 6. Dynamic activation results

| Check                                                    | Result                 |
| -------------------------------------------------------- | ---------------------- |
| Flag off → empty specialty workflows (tenant B)          | **PASS** (scenario 10) |
| Flag on → structure fire activates specialty             | **PASS** (scenario 1)  |
| Classification change preserves data / restores workflow | **PASS** (scenario 6)  |
| Form-descriptor fail-closed (`?? false`)                 | Deployed               |

---

## 7. Specialty-review results

| Check                                                  | Result                       |
| ------------------------------------------------------ | ---------------------------- |
| Specialty review panel on REVIEW (tenant A)            | **PASS**                     |
| Safety Officer / Hazmat / Prevention section approvals | **PASS** (scenarios 3–5)     |
| Casualty sections permission-gated + masked list       | **PASS** (scenarios 2, 3, 7) |

---

## 8. Repeatable-record results

| Type                                      | Result   |
| ----------------------------------------- | -------- |
| Exposures (scenario 1)                    | **PASS** |
| Civilian casualties (scenario 2)          | **PASS** |
| Fire-service casualties (scenario 3)      | **PASS** |
| Hazmat substances/containers (scenario 4) | **PASS** |
| Alarm + protection systems (scenario 5)   | **PASS** |

---

## 9. Attachment results

| Item                                           | Status                                           |
| ---------------------------------------------- | ------------------------------------------------ |
| JPEG / PNG / PDF happy path                    | **PASS**                                         |
| Unsupported / oversized / empty / invalid MIME | **PASS** (rejected)                              |
| Filenames with `..` `/` `\`                    | **PASS** (edge 403 or sanitized key)             |
| Interrupted upload never CLEARED               | **PASS**                                         |
| Invalid checksum / duplicate complete          | **PASS**                                         |
| Expired/corrupted pre-signed PUT               | **PASS** (rejected)                              |
| Unauthorized / cross-tenant                    | **PASS**                                         |
| Archived/finalized mutation denial             | **PASS**                                         |
| Quarantine never shown as CLEARED              | **PASS**                                         |
| Raw S3 not public / tenant-scoped keys         | **PASS**                                         |
| Attachment binary not in API JSON              | **PASS**                                         |
| Malware clearing service                       | **LIMITATION** — quarantine-only scanner remains |

---

## 10–15. Occupancy, proposals, permissions, casualty, flags, validation

Implemented and seeded. Specialty permissions on synthetic admin. Feature flag: only `rms-synthetic-fd` override `true`; tenant B denied (scenario 10). Restricted casualty masking + cross-tenant denial evidenced in scenarios 2, 3, 7.

---

## 16. Database migrations

| Migration                      | Aurora                  |
| ------------------------------ | ----------------------- |
| `0011_neris_specialty_records` | **Applied** (preserved) |
| `0012_neris_specialty_review`  | **Applied** (preserved) |

Runtime remains **`forge_app`**. FORCE RLS remains enabled (schema migrations). App secret **not** regenerated this closeout. **GAP-009** remains open — Data stack not deployed.

---

## 17–18. API / RMS Web

| Item                   | Result                                              |
| ---------------------- | --------------------------------------------------- |
| API task definition    | `forge-development-ecs-platform-api:16` (preserved) |
| API health (post-test) | **200** healthy                                     |
| RMS URL                | https://d3ud5uzwd9js2z.cloudfront.net **200**       |
| CloudFront / Compute   | Unchanged this closeout (tests only)                |

---

## 19–24. Tests

| Suite                                   | Result                                      |
| --------------------------------------- | ------------------------------------------- |
| Playwright `@phase3`                    | **20 passed, 0 failed, 0 skipped** (~8.9m)  |
| Playwright full regression              | **34 passed, 0 failed, 0 skipped** (~10.4m) |
| No `.only` / no disabled security tests | Confirmed for required suites               |

### Playwright totals by scenario / matrix

| Suite                                  | Tests | Result |
| -------------------------------------- | ----- | ------ |
| Scenario 1 (structure fire exposures)  | 1     | PASS   |
| Scenario 2 (civilian casualty)         | 1     | PASS   |
| Scenario 3 (fire-service casualty)     | 1     | PASS   |
| Scenario 4 (hazmat)                    | 1     | PASS   |
| Scenario 5 (alarm/sprinkler)           | 1     | PASS   |
| Scenario 6 (classification change)     | 1     | PASS   |
| Scenario 7 (unauthorized casualty)     | 1     | PASS   |
| Scenario 8 (cross-tenant attachments)  | 1     | PASS   |
| Scenario 9 (finalized specialty edits) | 1     | PASS   |
| Scenario 10 (feature-disabled tenant)  | 1     | PASS   |
| Specialty review smoke                 | 1     | PASS   |
| Attachment matrix                      | 1     | PASS   |
| Mobile matrix (6 viewports + dialogs)  | 7     | PASS   |
| Accessibility matrix                   | 1     | PASS   |
| Phase 2 regression (non-@phase3)       | 14    | PASS   |

---

## 25. Ten-scenario matrix

| #   | Scenario                           | Deployed result |
| --- | ---------------------------------- | --------------- |
| 1   | Structure fire + two exposures     | **PASS**        |
| 2   | Civilian casualty                  | **PASS**        |
| 3   | Firefighter injury                 | **PASS**        |
| 4   | Hazmat release                     | **PASS**        |
| 5   | Alarm + impaired sprinkler         | **PASS**        |
| 6   | Classification changed after entry | **PASS**        |
| 7   | Unauthorized casualty access       | **PASS**        |
| 8   | Cross-tenant attachment access     | **PASS**        |
| 9   | Finalized specialty-record edit    | **PASS**        |
| 10  | Feature-disabled tenant            | **PASS**        |

---

## 26–27. Mobile / accessibility

| Check                                                                               | Result                                        |
| ----------------------------------------------------------------------------------- | --------------------------------------------- |
| Specialty mobile matrix (390×844, 844×390, 768×1024, 1024×768, 1366×768, 1920×1080) | **PASS**                                      |
| No horizontal overflow / touch targets / rotation context                           | **PASS**                                      |
| Specialty accessibility (keyboard focus, headings, labels, Escape, 200% zoom)       | **PASS**                                      |
| Critical / Serious a11y findings                                                    | **None observed** in deployed specialty suite |
| Medium / Minor                                                                      | See §35 — track owners/dates                  |

---

## 28–29. Phase 1 / Phase 2 regression

Phase 2 Cognito Playwright regression included in the **34/34** run: isolation (7), autosave (2), login, manual intake, mobile, officer review/finalize — all **PASS**. Phase 1 RLS/FORCE remains enforced via `forge_app` runtime design + cross-tenant API denials in scenarios 2/7/8/10.

---

## 15b. RLS and permission verification (closeout)

| Check                                                | Result                                              |
| ---------------------------------------------------- | --------------------------------------------------- |
| Tenant A read denial against Tenant B resources      | **PASS** (scenarios 7–8 + isolation)                |
| Tenant A write denial against Tenant B               | **PASS**                                            |
| Missing / invalid / swapped tenant context           | **PASS**                                            |
| Restricted casualty read/write denial (cross-tenant) | **PASS**                                            |
| Attachment access denial                             | **PASS**                                            |
| Specialty review permission enforcement              | **PASS** (section approvals + review UI)            |
| Creator vs tenant separation                         | **PASS** (token tenant binding)                     |
| Feature-disabled tenant API denial                   | **PASS** (scenario 10)                              |
| Finalization locking                                 | **PASS** (scenarios 2–5, 9 + review workflow)       |
| Runtime DB role `forge_app`                          | **PASS** (preserved task secret ARN; no regenerate) |
| FORCE RLS enabled                                    | **PASS** (migration-enforced; no Data changes)      |

---

## 30–32. HTTPS / CloudWatch / CloudTrail

| Check                                                | Result                                                                                                                                    |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| AWS account / region                                 | **511343547817** / **us-east-1** (verified `sts get-caller-identity`)                                                                     |
| API health                                           | **PASS** — HTTP **200** `{"status":"healthy",...}` (sampled **2026-07-27T10:24:45Z**)                                                     |
| RMS CloudFront                                       | **PASS** — HTTP **200** (same sample window)                                                                                              |
| ECS API task                                         | **PASS** — `forge-development-ecs-platform-api:16`, running **1/1**, container **HEALTHY**, deployment COMPLETED, failedTasks **0**       |
| Runtime DB secret reference                          | **PASS** — task env `DATABASE_SECRET_ARN` → `arn:aws:secretsmanager:us-east-1:511343547817:secret:forge-development-secrets-database-app` |
| App secret LastChangedDate                           | **Unchanged** — `2026-07-26T15:30:16-05:00` (not regenerated)                                                                             |
| CloudTrail `forge-development-cloudtrail-management` | **PASS** — `IsLogging=true`; LatestDeliveryTime **2026-07-27T05:21:35-05:00**                                                             |
| CloudWatch `forge-development-alarm-*`               | **PASS** for API/ECS/DB/5xx family — see note for SSO directory alarm                                                                     |
| Unexpected ECS failures                              | **None** — no STOPPED tasks for API service; latest event steady state **2026-07-27T02:28:26-05:00**                                      |
| Unexpected API 5xx increase                          | **None** — `forge-development-alarm-api-5xx` and `forge-development-alarm-api-cf-5xx` remain **OK**                                       |

**Fresh evidence note (SSO re-sample):** After refreshing `forge-dev` SSO, operational baseline re-verified **2026-07-27 ~05:24 CDT / 10:24 UTC**. No stacks deployed; Data stack not touched; secrets not replaced.

**Alarm note:** `forge-development-alarm-sso-directory-changes` is **ALARM** (updated **2026-07-27T05:23:25-05:00**) coincident with SSO session refresh / directory activity. This is expected control noise from the verification login path, not an API or ECS failure. All other listed `forge-development-alarm-*` alarms were **OK** at sample time (including `api-5xx`, `api-cf-5xx`, `api-running-tasks`, `api-unhealthy`, CloudTrail stop/delete/update).

---

## 33. Deployment results

| Stack / action           | Result                                    |
| ------------------------ | ----------------------------------------- |
| `Forge-Development-Data` | **Not deployed** (GAP-009 protected)      |
| Compute / API `:16`      | **Preserved** (no redeploy this closeout) |
| Migrations `0011`/`0012` | **Preserved**                             |
| Feature flag             | Default false; synthetic tenant A only    |
| App secret               | **Not replaced**                          |

---

## 34. Cost impact

Test-only synthetic traffic; no new long-lived stacks. Quarantined attachment objects may accumulate under normal use.

---

## 35. Known limitations

1. Malware scanning remains interface-only (`QuarantineDefaultMalwareScanner` → never CLEARED). Users must not treat quarantined files as trusted — UI/API `clearedForUse=false` enforced in tests.
2. **GAP-009** Data stack still cannot be deployed until secret import is adopted in Data CDK.
3. Same-tenant limited-role (non-admin) Cognito user is not provisioned; unauthorized casualty proof uses cross-tenant + masked list semantics.
4. Accessibility Medium/Minor (owners/dates):
   - **M1** — Specialty review comment/assign controls density on phone landscape: Owner Engineering; Target 2026-08-15 (monitor; no Critical/Serious).
   - **M2** — Full axe scan against every specialty dialog variant not automated in Playwright: Owner Engineering; Target 2026-08-31.
5. `forge-development-alarm-sso-directory-changes` may ALARM when operators refresh SSO; treat as expected unless unrelated Identity Center changes occur.

---

## 36. Open risks

| Risk                             | Severity | Notes                                                         |
| -------------------------------- | -------- | ------------------------------------------------------------- |
| GAP-009 Data CDK drift           | Medium   | Keep `--exclusively` for Compute until import                 |
| Quarantine-only attachments      | Medium   | Operational labeling required                                 |
| SSO directory-change alarm noise | Low      | Expected on operator SSO refresh; correlate before escalating |

---

## 37. Recommended Phase 4

Do **not** start Phase 4 until product signs this report. Phase 4 candidates remain authorization-gated: external NERIS submit, CAD, offline, AI narrative, ePCR, IRWIN.

---

## 38. Human product sign-off section

Retain human decision blank until signed. Engineering recommendation: **ACCEPTED** for development use of specialty workflows on `rms-synthetic-fd` only.

| Role              | Name                                        | Date | Decision | Notes                                                          |
| ----------------- | ------------------------------------------- | ---- | -------- | -------------------------------------------------------------- |
| Product owner     | Jeremy Powell, Founder, Forge Public Safety |      |          | Sign to confirm ACCEPTED (or reject / retain WITH_LIMITATIONS) |
| Engineering lead  |                                             |      |          |                                                                |
| Security reviewer |                                             |      |          |                                                                |

**Do not forge approval.** Product status for human acceptance remains unsigned until Jeremy Powell completes this table.

---

## Appendix A — Evidence snapshot

```text
AWS account: 511343547817
Region: us-east-1
Caller (SSO): assumed-role/.../forge-admin
API task: forge-development-ecs-platform-api:16 (RUNNING 1/1, HEALTHY)
DATABASE_SECRET_ARN: ...:secret:forge-development-secrets-database-app
App secret LastChangedDate: 2026-07-26T15:30:16-05:00 (unchanged)
API health: 200 healthy @ 2026-07-27T10:24:45Z
RMS CloudFront: 200 @ same window
CloudTrail forge-development-cloudtrail-management: IsLogging=true
  LatestDeliveryTime: 2026-07-27T05:21:35-05:00
CloudWatch forge-development-alarm-*: OK (api-5xx, api-cf-5xx, running-tasks, unhealthy, …)
  Exception: sso-directory-changes=ALARM @ 2026-07-27T05:23:25-05:00 (SSO refresh)
ECS stopped API tasks: none
Playwright @phase3: 20 passed; full: 34 passed (2026-07-27)
Specialty override: rms-synthetic-fd=true only
GAP-009: Data stack not deployed
SSO re-sample: 2026-07-27 ~05:24 CDT / 10:24 UTC (no stack deploy)
```

## Appendix B — Closeout actions this session

1. Added dedicated Playwright suites for scenarios 2–9, attachment matrix, mobile matrix, accessibility matrix
2. Fixed S3 presigned PUT helper (`x-amz-server-side-encryption: aws:kms`)
3. Ran `@phase3` (20/20) and full regression (34/34)
4. Re-verified operational baseline after `forge-dev` SSO refresh (CloudTrail/CloudWatch/ECS/health/secret ARN)
5. Did **not** deploy Compute/Data, regenerate secrets, enable additional tenants, or start Phase 4
