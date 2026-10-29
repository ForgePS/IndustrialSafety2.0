# Import Platform — Open Limitation Register

**Document:** `docs/imports/import-platform-open-limitations.md`  
**Created:** 2026-07-29 (Sprint S8 baseline)  
**Updated:** 2026-07-30 (Sprint S8 closeout — deploy `:40`/`:25`, Option B named)  
**Status:** OPEN register — no limitation may be removed without closure evidence or formal deferral  
**Environment context:** development AWS `511343547817` / `us-east-1`  
**Deployed baseline:** tag `import-s8-20260729182259`, API TD `:40`, worker TD `:25`, migration `0027`

**S8 decision note:** (1) **Malware scanner** — ADR **Outcome B** production block for `reference-malware@1` (LIM-IMP-001 MITIGATED; Outcome A still required). (2) **Step Functions** — ADR Option B **`RETAIN_SQS_ECS_WORKER_PATH`** — API → SQS → ECS worker; SFN inactive; decision is **not** PENDING. See `docs/decisions/import-malware-provider-production-decision.md` and `docs/decisions/import-step-functions-production-decision.md`.

**S8 closeout evidence gaps (still open):** full browser E2E create→execute; Aurora load matrix (100k/250k **not** claimed); worker recovery drill; rollback rehearsal (`NOT_EXECUTED`); backup restore; live permission HTTP matrix; canary log hunt; DLQ poison exercise may still be running; Playwright suite added but green run **NOT_VERIFIED**.

Field schema (per S8 directive):

| Field               | Meaning                                                   |
| ------------------- | --------------------------------------------------------- |
| ID                  | Stable limitation identifier                              |
| Description         | Factual statement of the gap                              |
| Originating sprint  | First sprint that documented or introduced the limitation |
| Current impact      | What is true in the product/platform today                |
| Security impact     | Security / trust-boundary effect                          |
| Operational impact  | Ops / SRE / deploy effect                                 |
| User impact         | End-user / operator UX effect                             |
| Production impact   | Whether production enablement is blocked or restricted    |
| Existing mitigation | Controls already in place                                 |
| Required action     | What must happen to close or formally defer               |
| Owner               | Accountable role (interim)                                |
| Status              | OPEN \| MITIGATED \| DEFERRED \| CLOSED                   |
| Acceptance decision | How prior sprint acceptance treated this item             |
| Closure evidence    | Path or artifact proving closure (empty while OPEN)       |
| Deferred sprint     | Target sprint if deferred                                 |

---

## LIM-IMP-001 — Reference malware provider

| Field               | Value                                                                                                                                                                 |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ID                  | LIM-IMP-001                                                                                                                                                           |
| Description         | Dev/test scanner remains `reference-malware@1`. Production-like environments with GuardDuty enabled use `aws-guardduty-malware-protection@1` (S3 object tag polling). |
| Originating sprint  | S6                                                                                                                                                                    |
| Current impact      | Development/testing use reference provider. Production uses GuardDuty Malware Protection for S3 when plan + `IMPORT_MALWARE_PROVIDER_KEY` are deployed.               |
| Security impact     | Production coverage is GuardDuty S3 MP (tag-based verdicts). Reference remains synthetic in allowed envs only.                                                        |
| Operational impact  | Requires GuardDuty malware protection plan on imports bucket + ECS env `IMPORT_MALWARE_PROVIDER_KEY`.                                                                 |
| User impact         | Production Import Center uploads allowed when provider key is non-reference; banner/upload block only while still on reference.                                       |
| Production impact   | **Outcome A active** when GuardDuty plan + provider key are live; otherwise fail-closed Outcome B remains.                                                            |
| Existing mitigation | `ImportMalwareScanner` interface; GuardDuty scanner; `assertScannerAllowedForEnvironment`; no admin bypass.                                                           |
| Required action     | Record EICAR/harmless-signature validation evidence post-cutover; expand scan timeout/infected metrics/alarms.                                                        |
| Owner               | Platform security / Import Platform engineering (interim)                                                                                                             |
| Status              | **MITIGATED** (Outcome A cutover in progress; residual = evidence + alarms)                                                                                           |
| Acceptance decision | **Outcome A** authorized — GuardDuty Malware Protection for S3.                                                                                                       |
| Closure evidence    | `docs/decisions/import-malware-provider-production-decision.md`; `apps/worker-service/src/security/guardduty-s3-malware-scanner.ts`; CDK `ImportMalwareStack`         |
| Deferred sprint     | EICAR drill evidence + alarm hardening                                                                                                                                |

---

## LIM-IMP-002 — Inactive Step Functions

| Field               | Value                                                                                                                                                                                                                                                                                           |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ID                  | LIM-IMP-002                                                                                                                                                                                                                                                                                     |
| Description         | Import execution Step Functions remain definition-complete / not active. Package ASL includes `SecurityVerdictGate`; CDK construct historically `activate: false`; live account has **no** import state machine (`list-state-machines` empty). Operational path is API → SQS → ECS worker only. |
| Originating sprint  | S5                                                                                                                                                                                                                                                                                              |
| Current impact      | Orchestration durability/visibility is worker+DB based, not SFN executions.                                                                                                                                                                                                                     |
| Security impact     | Medium residual if ops assume SFN gate is live — mitigated by ADR Option B `RETAIN_SQS_ECS_WORKER_PATH` and API/worker gates.                                                                                                                                                                   |
| Operational impact  | No SFN console/ops tooling for import runs; runbooks/monitoring target SQS/worker/DLQ only.                                                                                                                                                                                                     |
| User impact         | None direct if worker path healthy. UI must not claim SFN is active.                                                                                                                                                                                                                            |
| Production impact   | SFN activation not part of production path (**Option B — `RETAIN_SQS_ECS_WORKER_PATH`**).                                                                                                                                                                                                       |
| Existing mitigation | Worker consumer for `IMPORT_EXECUTE` / malware / upload detect; API state machine + locks; security gates in API/worker; deployed worker TD `:25`.                                                                                                                                              |
| Required action     | Only if product/ops later authorize `ACTIVATE_STEP_FUNCTIONS`: deploy/align ASL, EventBridge Pipe (or equivalent), tests, cost review — per ADR future criteria.                                                                                                                                |
| Owner               | Platform infrastructure / Import Platform engineering (interim)                                                                                                                                                                                                                                 |
| Status              | **DEFERRED**                                                                                                                                                                                                                                                                                    |
| Acceptance decision | **ADR Option B — `RETAIN_SQS_ECS_WORKER_PATH`** — keep API → SQS → ECS; do not activate merely because a definition exists; no activation in S8 closeout.                                                                                                                                       |
| Closure evidence    | `docs/decisions/import-step-functions-production-decision.md`                                                                                                                                                                                                                                   |
| Deferred sprint     | Separate activation track (explicit authorization required)                                                                                                                                                                                                                                     |

---

## LIM-IMP-003 — Aurora-scale validation

| Field               | Value                                                                                                                                                                                                                                                                               |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ID                  | LIM-IMP-003                                                                                                                                                                                                                                                                         |
| Description         | No Aurora-backed multi-tenant load / scale validation of import execution, malware queue depth, or batch throughput. Only in-process reference-adapter smoke (**500** and **5k** rows) exists. Aurora 100k/250k and concurrency limits are **NOT_VERIFIED** — do not invent passes. |
| Originating sprint  | S5 (called out again S6/S8 closeout)                                                                                                                                                                                                                                                |
| Current impact      | Capacity and contention characteristics under realistic Aurora load are unknown (serverless writer + worker 256/512 deployed but unmeasured under import load).                                                                                                                     |
| Security impact     | Low direct; potential RLS/lock contention under load is unproven.                                                                                                                                                                                                                   |
| Operational impact  | Cannot set evidence-based scaling alarms/thresholds beyond SQS backlog heuristics.                                                                                                                                                                                                  |
| User impact         | Risk of slow jobs / timeouts under concurrent tenants (unmeasured).                                                                                                                                                                                                                 |
| Production impact   | Scale claims not authorized; freeze row/concurrency limits remain **NOT_VERIFIED** placeholders.                                                                                                                                                                                    |
| Existing mitigation | In-process 500/5k reference adapter tests; SQS backlog alarm (threshold 100); **`S8_BATCH_RECOMMENDATION`** (default 50, max 500); performance/batch/concurrency docs.                                                                                                              |
| Required action     | Execute controlled non-prod Aurora multi-size matrix; publish measured results (do not invent 100k/250k passes).                                                                                                                                                                    |
| Owner               | Import Platform engineering (interim)                                                                                                                                                                                                                                               |
| Status              | OPEN                                                                                                                                                                                                                                                                                |
| Acceptance decision | Accepted with limitation (S5/S6). **S8 closeout:** protocol + honest docs; Aurora rows remain **NOT_VERIFIED**.                                                                                                                                                                     |
| Closure evidence    | — (protocol only until controlled run artifacts exist)                                                                                                                                                                                                                              |
| Deferred sprint     | Controlled-run track (protocol ready in S8)                                                                                                                                                                                                                                         |

---

## LIM-IMP-004 — Full rollback compensation

| Field               | Value                                                                                                                                                                         |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ID                  | LIM-IMP-004                                                                                                                                                                   |
| Description         | Rollback APIs/UI submit **classification requests** only (`SAFE` / `CONDITIONAL` / `UNSAFE` / `EXPIRED`). Full compensating transactions / destination undo are not executed. |
| Originating sprint  | S5                                                                                                                                                                            |
| Current impact      | `ROLLBACK_PENDING` / `ROLLBACK_REFUSED` reflect classification, not completed compensation.                                                                                   |
| Security impact     | Low–medium — operators may assume data was undone when only classified.                                                                                                       |
| Operational impact  | Manual remediation required for unsafe commits.                                                                                                                               |
| User impact         | UI wording (S7) warns classification-only; no full undo.                                                                                                                      |
| Production impact   | Cannot promise automated rollback safety for production imports.                                                                                                              |
| Existing mitigation | Explicit UI copy; rollback safety enums; journal preparation fields.                                                                                                          |
| Required action     | Design and authorize compensation adapters per product; or formal deferral with operator runbook.                                                                             |
| Owner               | Import Platform engineering / product (interim)                                                                                                                               |
| Status              | OPEN                                                                                                                                                                          |
| Acceptance decision | Documented limitation S5–S7.                                                                                                                                                  |
| Closure evidence    | —                                                                                                                                                                             |
| Deferred sprint     | Later sprint (post-S8 unless separately authorized)                                                                                                                           |

---

## LIM-IMP-005 — Polling-based execution monitor

| Field               | Value                                                                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| ID                  | LIM-IMP-005                                                                                                                                 |
| Description         | Import Center execution monitor polls job status every **3 seconds** and stops on terminal states. No push/WebSocket/SSE real-time channel. |
| Originating sprint  | S7                                                                                                                                          |
| Current impact      | Progress UI updates on poll cadence only.                                                                                                   |
| Security impact     | Low.                                                                                                                                        |
| Operational impact  | Extra API read load under many concurrent monitors.                                                                                         |
| User impact         | Slight lag vs true real-time; acceptable for MVP.                                                                                           |
| Production impact   | Optional enhancement; not a production blocker by itself.                                                                                   |
| Existing mitigation | Poll interval + clear on terminal; permission-gated status reads.                                                                           |
| Required action     | Optional real-time monitor or accept with evidence of poll stop behavior.                                                                   |
| Owner               | Import Center UI engineering (interim)                                                                                                      |
| Status              | OPEN                                                                                                                                        |
| Acceptance decision | Documented S7 UI limitation.                                                                                                                |
| Closure evidence    | —                                                                                                                                           |
| Deferred sprint     | Optional enhancement track                                                                                                                  |

---

## LIM-IMP-006 — Product-specific field catalogs

| Field               | Value                                                                                                                                                 |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| ID                  | LIM-IMP-006                                                                                                                                           |
| Description         | Mapping UI uses generic product/module/record keys and neutral fixtures. No product-owned field catalogs (RMS/Academy/etc.) wired into Import Center. |
| Originating sprint  | S7 (adapters deferred since S5)                                                                                                                       |
| Current impact      | Operators map against generic/server keys only.                                                                                                       |
| Security impact     | Low — avoids incorrect product writes; no adapters committing product data.                                                                           |
| Operational impact  | Product go-live imports blocked until adapters/catalogs authorized.                                                                                   |
| User impact         | Limited mapping guidance; no domain field pickers.                                                                                                    |
| Production impact   | Product import enablement blocked without adapters.                                                                                                   |
| Existing mitigation | Generic keys; reference adapter only; templates meta without product commit.                                                                          |
| Required action     | Separate authorization for product adapters + catalogs.                                                                                               |
| Owner               | Product engineering (per product) (interim)                                                                                                           |
| Status              | OPEN                                                                                                                                                  |
| Acceptance decision | Explicitly out of S7/S8; documented limitation. **No product adapters in S8.**                                                                        |
| Closure evidence    | —                                                                                                                                                     |
| Deferred sprint     | Later (adapters not S8 default scope unless authorized)                                                                                               |

---

## LIM-IMP-007 — Product-specific sensitivity metadata

| Field               | Value                                                                                                                                |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| ID                  | LIM-IMP-007                                                                                                                          |
| Description         | Sensitive-field classification relies on name-hint heuristics + config defaults, not complete product sensitivity metadata catalogs. |
| Originating sprint  | S6                                                                                                                                   |
| Current impact      | Masking is conservative but may miss product-specific sensitive fields without hints.                                                |
| Security impact     | Medium — over-mask preferred; CREDENTIAL never unmasked; residual under-classification risk for unlabeled fields.                    |
| Operational impact  | Security report / download masking quality depends on heuristics.                                                                    |
| User impact         | Some fields may show as masked/unmasked incorrectly relative to product policy.                                                      |
| Production impact   | Prefer product metadata before broad sensitive-data enablement.                                                                      |
| Existing mitigation | Conservative masking; `import.sensitive` for privileged download; audit events.                                                      |
| Required action     | Product sensitivity metadata via adapters/config; expand tests.                                                                      |
| Owner               | Security + product engineering (interim)                                                                                             |
| Status              | OPEN                                                                                                                                 |
| Acceptance decision | Documented S6 limitation.                                                                                                            |
| Closure evidence    | —                                                                                                                                    |
| Deferred sprint     | Adapters track                                                                                                                       |

---

## LIM-IMP-008 — Limited narrow-screen mapping

| Field               | Value                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------ |
| ID                  | LIM-IMP-008                                                                                |
| Description         | Import Center mapping/workspace is desktop/tablet-first; narrow phone layouts are limited. |
| Originating sprint  | S7                                                                                         |
| Current impact      | Phone-width mapping UX degraded or constrained.                                            |
| Security impact     | None.                                                                                      |
| Operational impact  | None.                                                                                      |
| User impact         | Mobile operators may struggle with mapping grids.                                          |
| Production impact   | Acceptable if operator persona is desktop; gap for phone-first tenants.                    |
| Existing mitigation | Desktop/tablet primary design; responsive basics only.                                     |
| Required action     | Responsive mapping pass + viewport evidence, or formal deferral.                           |
| Owner               | Import Center UI engineering (interim)                                                     |
| Status              | OPEN                                                                                       |
| Acceptance decision | Documented S7 UI limitation; restated in S8 a11y requirements.                             |
| Closure evidence    | —                                                                                          |
| Deferred sprint     | Later (or with a11y evidence pack)                                                         |

---

## LIM-IMP-009 — Quarantine release unavailable

| Field               | Value                                                                                                                                                                                                                                                                                    |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ID                  | LIM-IMP-009                                                                                                                                                                                                                                                                              |
| Description         | Quarantined files can be viewed/rescanned in workflow; there is no authorized **release-from-quarantine** control that restores a previously INFECTED/QUARANTINED object to a clean executable path without rescan/policy gates. Override release is also unavailable (see LIM-IMP-010). |
| Originating sprint  | S6 (API quarantine); S7 (UI quarantine view without release)                                                                                                                                                                                                                             |
| Current impact      | Quarantine is sticky aside from rescan transitions defined by server.                                                                                                                                                                                                                    |
| Security impact     | Positive fail-closed posture; release absence prevents unsafe unblock.                                                                                                                                                                                                                   |
| Operational impact  | Operators must rescan or abandon; no one-click release.                                                                                                                                                                                                                                  |
| User impact         | Quarantine panel explains hold; no release button.                                                                                                                                                                                                                                       |
| Production impact   | Intentional until override/release policy authorized.                                                                                                                                                                                                                                    |
| Existing mitigation | Quarantine copy+tags; security hold; execute gates.                                                                                                                                                                                                                                      |
| Required action     | Policy + API + UI for controlled release **only if authorized**; else document as permanent fail-closed deferral.                                                                                                                                                                        |
| Owner               | Security (interim)                                                                                                                                                                                                                                                                       |
| Status              | OPEN                                                                                                                                                                                                                                                                                     |
| Acceptance decision | Overrides reserved; no release endpoint (S6/S7).                                                                                                                                                                                                                                         |
| Closure evidence    | —                                                                                                                                                                                                                                                                                        |
| Deferred sprint     | Requires separate security authorization                                                                                                                                                                                                                                                 |

---

## LIM-IMP-010 — Malware override unavailable

| Field               | Value                                                                                                                                                 |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| ID                  | LIM-IMP-010                                                                                                                                           |
| Description         | Verdict `OVERRIDE_APPROVED` is reserved in gate/ASL; **no** HTTP override endpoint or Import Center control ships. UI states override is unavailable. |
| Originating sprint  | S6                                                                                                                                                    |
| Current impact      | Cannot force CLEAN/execute past INFECTED/SUSPICIOUS via product UI/API.                                                                               |
| Security impact     | Positive — reduces unsafe bypass; false positives require rescan/provider fix.                                                                        |
| Operational impact  | Support must use rescan/provider paths only.                                                                                                          |
| User impact         | No override control in security/quarantine views.                                                                                                     |
| Production impact   | Override feature blocked until authorized.                                                                                                            |
| Existing mitigation | Fail-closed gates; rescan API (`import.validate`).                                                                                                    |
| Required action     | If needed: authorized override workflow with audit, dual-control, and evidence.                                                                       |
| Owner               | Security (interim)                                                                                                                                    |
| Status              | OPEN                                                                                                                                                  |
| Acceptance decision | Explicit S6 design decision; S7 UI confirms unavailable.                                                                                              |
| Closure evidence    | —                                                                                                                                                     |
| Deferred sprint     | Requires separate security authorization                                                                                                              |

---

## LIM-IMP-011 — Browser-level accessibility evidence

| Field               | Value                                                                                                                                                                                                                                                                                                                           |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ID                  | LIM-IMP-011                                                                                                                                                                                                                                                                                                                     |
| Description         | Browser a11y evidence for Import Center (keyboard, focus order, live regions, axe/WCAG) is incomplete. Suite file `apps/configuration-e2e/tests/import-center-s8.spec.ts` was **added** (dashboard axe + landmarks) but recorded run failed to launch Chromium — green evidence **NOT_VERIFIED**. Not a full keyboard workflow. |
| Originating sprint  | S7 (gap); S8 DoD expects a11y                                                                                                                                                                                                                                                                                                   |
| Current impact      | Accessibility quality is unproven beyond code semantics + failing/missing browser run.                                                                                                                                                                                                                                          |
| Security impact     | None direct.                                                                                                                                                                                                                                                                                                                    |
| Operational impact  | Acceptance risk until green evidence attached.                                                                                                                                                                                                                                                                                  |
| User impact         | Assistive-tech users may hit unverified barriers.                                                                                                                                                                                                                                                                               |
| Production impact   | DoD incomplete without evidence.                                                                                                                                                                                                                                                                                                |
| Existing mitigation | Semantic headings/labels in Import Center panels; requirements + suite in `docs/testing/import-platform-s8-accessibility.md`; log `s8-playwright-import-center.log`.                                                                                                                                                            |
| Required action     | Install browsers, re-run suite, attach axe JSON + keyboard notes; expand beyond dashboard surface.                                                                                                                                                                                                                              |
| Owner               | Import Center UI + QA (interim)                                                                                                                                                                                                                                                                                                 |
| Status              | OPEN — **still needs evidence**                                                                                                                                                                                                                                                                                                 |
| Acceptance decision | S7 accepted with UI limitations; S8 added suite; green run still open.                                                                                                                                                                                                                                                          |
| Closure evidence    | —                                                                                                                                                                                                                                                                                                                               |
| Deferred sprint     | Until browser pack lands                                                                                                                                                                                                                                                                                                        |

---

## LIM-IMP-012 — Complete tenant-switch cache evidence

| Field               | Value                                                                                                                                                                                                     |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ID                  | LIM-IMP-012                                                                                                                                                                                               |
| Description         | Unit test proves `clearImportTenantCache` clears in-memory buckets; **no** browser evidence that tenant switch during an active Import Center workflow clears cache and prevents cross-tenant UI leakage. |
| Originating sprint  | S7                                                                                                                                                                                                        |
| Current impact      | Cache helper exists; end-to-end tenant-switch proof missing.                                                                                                                                              |
| Security impact     | Medium until browser-proven — cross-tenant UI residual risk if switch path forgets clear.                                                                                                                 |
| Operational impact  | None.                                                                                                                                                                                                     |
| User impact         | Potential stale jobs list/detail after tenant switch (unproven).                                                                                                                                          |
| Production impact   | Isolation claim incomplete without browser evidence.                                                                                                                                                      |
| Existing mitigation | `cache.ts` tenant buckets; unit test clear; API still RLS-enforced.                                                                                                                                       |
| Required action     | Playwright (or approved) tenant A→B switch scenario with cache assertions.                                                                                                                                |
| Owner               | Import Center UI + QA (interim)                                                                                                                                                                           |
| Status              | OPEN — **still needs evidence**                                                                                                                                                                           |
| Acceptance decision | Unit coverage only at S7; S8 results mark browser proof PENDING.                                                                                                                                          |
| Closure evidence    | —                                                                                                                                                                                                         |
| Deferred sprint     | Until browser pack lands                                                                                                                                                                                  |

---

## LIM-IMP-013 — Protected download browser evidence

| Field               | Value                                                                                                                                                                                                                                                                                                            |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ID                  | LIM-IMP-013                                                                                                                                                                                                                                                                                                      |
| Description         | Protected download helper fetches short-lived URL, blobs to object URL, clicks download, revokes object URL, and clears active URL in `finally`. Unit tests cover dispose/expiry helpers only — **no** browser evidence for privileged/masked download flows, expiration, or non-persistence in history/storage. |
| Originating sprint  | S7                                                                                                                                                                                                                                                                                                               |
| Current impact      | Download security UX unverified in real browsers.                                                                                                                                                                                                                                                                |
| Security impact     | Medium until proven — risk of URL leakage via history/devtools if integration regresses.                                                                                                                                                                                                                         |
| Operational impact  | Support cannot cite browser evidence for download incidents.                                                                                                                                                                                                                                                     |
| User impact         | Privileged download UX unproven under `import.sensitive`.                                                                                                                                                                                                                                                        |
| Production impact   | Sensitive download acceptance incomplete.                                                                                                                                                                                                                                                                        |
| Existing mitigation | Code comments + dispose pattern; server gated downloads; unit dispose test.                                                                                                                                                                                                                                      |
| Required action     | Browser evidence for masked + privileged download, expiry, and no URL persistence.                                                                                                                                                                                                                               |
| Owner               | Import Center UI + security (interim)                                                                                                                                                                                                                                                                            |
| Status              | OPEN — **still needs evidence**                                                                                                                                                                                                                                                                                  |
| Acceptance decision | Unit-level only at S7; S8 results mark PENDING.                                                                                                                                                                                                                                                                  |
| Closure evidence    | —                                                                                                                                                                                                                                                                                                                |
| Deferred sprint     | Until browser pack lands                                                                                                                                                                                                                                                                                         |

---

## LIM-IMP-014 — Presigned URL disposal evidence

| Field               | Value                                                                                                                                                                                                                                                          |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ID                  | LIM-IMP-014                                                                                                                                                                                                                                                    |
| Description         | Upload and artifact flows use short-lived presigned URLs. Client disposal patterns exist for protected download object URLs; **browser evidence** that upload/download presigned URLs are not retained in app state, logs, or storage after use is incomplete. |
| Originating sprint  | S3 (presign architecture); evidence gap restated S7/S8                                                                                                                                                                                                         |
| Current impact      | Contract forbids URLs in queue messages; client disposal partially unit-tested for protected downloads only.                                                                                                                                                   |
| Security impact     | Medium — URL exfiltration window if clients retain presigns.                                                                                                                                                                                                   |
| Operational impact  | Harder to audit client-side URL lifecycle.                                                                                                                                                                                                                     |
| User impact         | None visible if working; residual privacy risk.                                                                                                                                                                                                                |
| Production impact   | Hardening evidence required for browser data-safety.                                                                                                                                                                                                           |
| Existing mitigation | Short TTL presigns; queue contract forbids URLs; `disposeDownloadUrl` / revokeObjectURL in download helper.                                                                                                                                                    |
| Required action     | Browser data-safety evidence covering upload + artifact presign disposal; expand tests as needed.                                                                                                                                                              |
| Owner               | Import Platform + Import Center (interim)                                                                                                                                                                                                                      |
| Status              | OPEN — **still needs evidence**                                                                                                                                                                                                                                |
| Acceptance decision | Architectural mitigation accepted; browser disposal evidence still open.                                                                                                                                                                                       |
| Closure evidence    | —                                                                                                                                                                                                                                                              |
| Deferred sprint     | Until browser pack lands                                                                                                                                                                                                                                       |

---

## Register index

| ID          | Title                                 | Status                                                   | Origin   |
| ----------- | ------------------------------------- | -------------------------------------------------------- | -------- |
| LIM-IMP-001 | Reference malware provider            | **MITIGATED** (Outcome B; Outcome A still required)      | S6/S8    |
| LIM-IMP-002 | Inactive Step Functions               | **DEFERRED** (ADR Option B `RETAIN_SQS_ECS_WORKER_PATH`) | S5/S8    |
| LIM-IMP-003 | Aurora-scale validation               | OPEN (in-process 500/5k only; Aurora NOT_VERIFIED)       | S5/S6/S8 |
| LIM-IMP-004 | Full rollback compensation            | OPEN                                                     | S5       |
| LIM-IMP-005 | Polling-based execution monitor       | OPEN                                                     | S7       |
| LIM-IMP-006 | Product-specific field catalogs       | OPEN                                                     | S7       |
| LIM-IMP-007 | Product-specific sensitivity metadata | OPEN                                                     | S6       |
| LIM-IMP-008 | Limited narrow-screen mapping         | OPEN                                                     | S7       |
| LIM-IMP-009 | Quarantine release unavailable        | OPEN                                                     | S6/S7    |
| LIM-IMP-010 | Malware override unavailable          | OPEN                                                     | S6       |
| LIM-IMP-011 | Browser-level accessibility evidence  | OPEN (suite added; green NOT_VERIFIED)                   | S7/S8    |
| LIM-IMP-012 | Complete tenant-switch cache evidence | OPEN (needs evidence)                                    | S7       |
| LIM-IMP-013 | Protected download browser evidence   | OPEN (needs evidence)                                    | S7       |
| LIM-IMP-014 | Presigned URL disposal evidence       | OPEN (needs evidence)                                    | S3/S7/S8 |

**Rule:** No row may be deleted. Transition to CLOSED only with `Closure evidence` filled, or to DEFERRED with `Deferred sprint` + acceptance decision recorded. MITIGATED means residual risk is controlled (e.g. Outcome B) but may still require a follow-on action (e.g. Outcome A provider).
