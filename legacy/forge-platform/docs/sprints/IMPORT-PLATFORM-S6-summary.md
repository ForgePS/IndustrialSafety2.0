# Import Platform — Sprint S6 Summary

**Date:** 2026-07-29  
**Status:** **READY_FOR_REVIEW**  
**Do not start S7 until S6 is ACCEPTED.**

## Objectives

Shared malware scanning, fail-closed verdict enforcement, quarantine, sensitive-field
classification/masking, protected artifact downloads, audit/log hardening, retention
helpers, and security metrics — without UI, product adapters, or Step Functions activation.

## Completed work

- Migration `0027_import_platform_s6_security.sql` (scan events, security artifacts, file/job security columns, FORCE RLS)
- `@forge/imports`: scanner interface, reference provider, verdict gate, masking, retention, malware queue message, SFN security gate in ASL
- Upload complete enqueues `IMPORT_MALWARE_SCAN` (not format detect first)
- Worker malware processor → CLEAN then format detect; quarantine copy+tags; execute gate
- API: rescan, scan history, results/errors/security-report downloads; execute/approve gates; duplicate/error masking
- OpenAPI `0.6.0-s6`
- Architecture + ops docs

## Design decisions

| Topic      | Decision                                                                    |
| ---------- | --------------------------------------------------------------------------- |
| Scanner    | `reference-malware@1` behind `ImportMalwareScanner` (dev/test; replaceable) |
| Overrides  | Reserved verdicts only — **no override HTTP endpoint**                      |
| CLEAN path | Stay `SCANNING` → format detect → `READY_FOR_MAPPING`                       |
| Quarantine | Copy to `tenants/{tenant}/quarantine/...` + tags; retain original           |

## API endpoints added

| Method | Path                                    | Permission                                      |
| ------ | --------------------------------------- | ----------------------------------------------- |
| GET    | `/jobs/{id}/files/{fileId}/scan-events` | import.view                                     |
| POST   | `/jobs/{id}/files/{fileId}/rescan`      | import.validate                                 |
| POST   | `/jobs/{id}/results/download`           | import.view (+ import.sensitive for privileged) |
| POST   | `/jobs/{id}/errors/download`            | import.view                                     |
| POST   | `/jobs/{id}/security-report/download`   | import.view                                     |

## Malware transitions

| From                      | Action             | To                            |
| ------------------------- | ------------------ | ----------------------------- |
| UPLOADED                  | malware_start      | SCANNING                      |
| SCANNING                  | malware_clean      | SCANNING (then format detect) |
| SCANNING                  | detection_pass     | READY_FOR_MAPPING             |
| SCANNING                  | malware_quarantine | QUARANTINED                   |
| SCANNING                  | malware_fail       | SCAN_FAILED                   |
| SCAN_FAILED / QUARANTINED | rescan_start       | SCANNING                      |

## Step Functions

**DEFINITION_COMPLETE_DEPLOYMENT_PENDING** — ASL includes `SecurityVerdictGate`; not activated.

## Known limitations

| Limitation                            | Impact                      | Mitigation                                         | Future                  |
| ------------------------------------- | --------------------------- | -------------------------------------------------- | ----------------------- |
| Reference scanner only                | Not multi-AV / GuardDuty    | Interface abstraction; EICAR/key signals for tests | S8+ provider redundancy |
| Product-specific sensitivity metadata | Name-hint + config defaults | Conservative masking; CREDENTIAL never unmasked    | Adapters (S7+)          |
| Step Functions inactive               | Worker path only            | API + worker gates                                 | Separate activation     |
| Aurora-scale perf                     | Not load-tested             | Unit/perf helpers                                  | S8                      |
| Full rollback compensation            | Deferred                    | Classification only                                | Later sprint            |
| UI quarantine/sensitive review        | Deferred                    | API + audit                                        | S7 UI (not authorized)  |

Production use: development/security-hardening ready; production scanner provider swap recommended before high-risk tenant enablement.

## Recommendation for S7

Import Center UI / mapping & preview UX only after S6 ACCEPTED. Do not implement product adapters or QR in S6.

## Deployment

**Status:** COMPLETE (2026-07-29, forge-dev / us-east-1)

| Item                       | Value                                                                     |
| -------------------------- | ------------------------------------------------------------------------- |
| Tag                        | `import-s6-20260729202056`                                                |
| API TD                     | `:39` (prior `:38`)                                                       |
| Worker TD                  | `:24` (prior `:23`)                                                       |
| API digest                 | `sha256:ee121aa53a77a8a8cde0a761d3684f77e13a4b44340602ee827c51aa8dc45e9f` |
| Worker digest              | `sha256:9df1d452ed237bacf2ab35f84c4c0832efd6611798465655b591a107f4c28ab7` |
| Migrate exit               | `0` (`0027_import_platform_s6_security`, admin secret)                    |
| Smoke                      | health `200`; execute / results/download / rescan unauth all `401`        |
| App secret LastChangedDate | unchanged `2026-07-26T15:30:16.387000-05:00`                              |

Full write-up: `docs/deployment/import-platform-s6-deployment.md`  
Evidence: `docs/testing/evidence/import-platform/s6-*`
