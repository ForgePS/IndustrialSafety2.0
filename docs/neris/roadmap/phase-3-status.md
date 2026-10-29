# NERIS Phase 3 — Status and Roadmap

**Last updated:** 2026-07-26 (limitation closeout)  
**Authorization:** Phase 3 development + limitation closeout / full acceptance directive

## Phase summary

| Phase   | Name                                 | Status                                         |
| ------- | ------------------------------------ | ---------------------------------------------- |
| Phase 1 | Schema Foundation                    | COMPLETE                                       |
| Phase 2 | Core Incident Shell + MANUAL_ONLY    | COMPLETE                                       |
| Phase 3 | Dynamic fire and specialty workflows | ACCEPTED (engineering; human sign-off pending) |

## Phase 3 acceptance

See [phase-3-final-acceptance-report.md](../phase-3-final-acceptance-report.md). Decision: **ACCEPTED**. Phase 4 not started. Product owner sign-off still required.

SOC 2 remains a **readiness program** only. Do not claim certification, compliance, audit completion, Type 1, or Type 2.

## Phase 3 objective

Build schema-driven specialty workflows so users see only relevant sections based on classification, actions, property characteristics, and related signals — without a second incident engine and without dumping all NERIS fields at once.

## Deliverables

| Area                                              | Status       | Notes                                                   |
| ------------------------------------------------- | ------------ | ------------------------------------------------------- |
| Specialty workflow engine (`@forge/neris`)        | DONE         | Declarative groups + activation rules                   |
| Form descriptor wiring (live values)              | DONE         | Modules map into specialty sections                     |
| Specialty section API                             | DONE         | `POST …/specialty-sections`                             |
| Feature flag default **false**                    | DONE         | Override only on approved synthetic FD                  |
| Dynamic RMS Web nav + banners + N/A               | DONE         | Classification-driven navigation                        |
| Section completion indicators                     | DONE         | Percent + required gaps                                 |
| Attachments (presign, quarantine scan, archive)   | ACCEPTED     | Quarantine-default scanner; full attachment matrix PASS |
| Exposure / casualty / hazmat / system records     | ACCEPTED     | Scenarios 1–5 Cognito PASS                              |
| Occupancy/preplan links + proposals               | DEPLOYED     | Apply requires masterdata.manage                        |
| Specialty validation                              | DEPLOYED     | Progressive findings in validate runs                   |
| Specialty permissions + reviewer roles            | DEPLOYED     | Synthetic admin permissions synced                      |
| Restricted casualty access                        | DEPLOYED     | Masked lists + access audit                             |
| Specialty review UI                               | DEPLOYED     | Verified on REVIEW in Cognito Playwright                |
| Specialty review APIs                             | DEPLOYED     | Resolve/reopen; section return/approve                  |
| CI specialty/attachment/a11y tests                | DONE         | Expanded `neris-incidents-unit-tests` job               |
| Playwright Phase 3 + Phase 2 regression           | DONE         | **34/34 passed** (20 `@phase3`)                         |
| Ten-scenario Cognito matrix                       | DONE         | Scenarios 1–10 PASS                                     |
| IRWIN transmission                                | OUT OF SCOPE | Architecture hooks only                                 |
| CAD / external NERIS submit / offline / AI / ePCR | OUT OF SCOPE | Separate authorization required                         |

## Workflow groups

FIRE, STRUCTURE, WILDLAND, HAZMAT, RESCUE, EXPLOSION, EXPOSURES, CIVILIAN_CASUALTIES, FIRE_SERVICE_CASUALTIES, ALARM_DETECTION, FIRE_PROTECTION, EMERGING_HAZARDS, RISK_REDUCTION, INCIDENT_ANALYSIS.

## Documentation

| Doc                             | Path                                                                                |
| ------------------------------- | ----------------------------------------------------------------------------------- |
| Specialty workflow architecture | [specialty-workflows.md](../architecture/specialty-workflows.md)                    |
| Repeatable specialty records    | [repeatable-specialty-records.md](../architecture/repeatable-specialty-records.md)  |
| Attachments                     | [attachments.md](../architecture/attachments.md)                                    |
| Casualty access                 | [casualty-access.md](../security/casualty-access.md)                                |
| Specialty API                   | [repeatable-specialty-records.md](../api/repeatable-specialty-records.md)           |
| Increment tests                 | [phase-3-repeatable-record-tests.md](../testing/phase-3-repeatable-record-tests.md) |
| Final acceptance report         | [phase-3-final-acceptance-report.md](../phase-3-final-acceptance-report.md)         |

## Explicit non-goals (this phase)

- CAD integration
- External NERIS submission
- NERIS offline synchronization
- AI narrative generation
- ePCR development (casualty workflow links architecture only)
- Full IRWIN transmission
- SOC 2 Type 1 or Type 2 work
- Production customer onboarding

## Phase 3 acceptance

**INCOMPLETE** — see [phase-3-final-acceptance-report.md](../phase-3-final-acceptance-report.md). Code and CI for specialty review are in place; deployed 10-scenario matrix, ECS migrate for `0011`/`0012`, and Compute/Frontend deploy verification remain blocked pending explicit deploy approval (GAP-009: do not deploy Data stack).
