# Control Testing Plan

**Document ID:** SOC2-CTL-003  
**Version:** 0.1 (draft)  
**Date:** 2026-07-26

Defines how Forge **tests whether controls actually operate** before relying on them in readiness discussions. This is internal testing — not a CPA examination.

---

## 1. Test types

| Type                          | Description                                           | Typical frequency      |
| ----------------------------- | ----------------------------------------------------- | ---------------------- |
| **Automated continuous**      | CI / scripts that fail the pipeline if control breaks | Every PR / deploy      |
| **Periodic technical verify** | Scripts against live AWS/app config                   | Monthly or per release |
| **Operational sample**        | Sample tickets, PRs, access reviews                   | Quarterly              |
| **Tabletop / drill**          | IR, restore, failover walkthrough                     | Semi-annual            |

---

## 2. Priority test plan (Phase 0–1)

| Control ID  | Test procedure                                                                    | Pass criteria                                                                            | Evidence location      | Cadence                                            |
| ----------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------- | -------------------------------------------------- |
| CC-ISO-01   | Run RLS verification script / CI RLS suite                                        | FORCE RLS confirmed; tenant policies present                                             | `evidence/testing/`    | Per release                                        |
| CC-ISO-02   | Inspect ECS task def `DATABASE_SECRET_ARN` = app secret; confirm role ≠ BYPASSRLS | Matches app secret; verify script OK                                                     | `evidence/testing/`    | Monthly                                            |
| CC-ISO-03   | Playwright isolation suite                                                        | All isolation tests pass                                                                 | `evidence/testing/`    | Per release                                        |
| CC-CRY-02   | Header / HTTPS verification script                                                | Required security headers + HTTPS                                                        | `evidence/testing/`    | Per release                                        |
| CC-SEC-02   | CI gitleaks                                                                       | No secrets findings on main                                                              | `evidence/change/`     | Every PR                                           |
| CC-CHG-01   | Sample 5 merged PRs                                                               | Reviewer present; CI green                                                               | `evidence/change/`     | Quarterly                                          |
| CC-LOG-01   | `scripts/compliance/export-cloudtrail-*.mjs` + controlled events                  | IsLogging=true; multi-region; validation; CW delivery; alarms present; evidence ACCEPTED | `evidence/cloudtrail/` | After deploy (done 2026-07-26); monthly thereafter |
| CC-ACC-03   | Complete access review worksheet                                                  | All privileged users attested                                                            | `../access-reviews/`   | Quarterly                                          |
| A-AVL-02/03 | Backup job status + restore drill                                                 | Restore success documented                                                               | `evidence/backups/`    | Semi-annual                                        |
| CC-IR-01    | Incident tabletop                                                                 | Lessons logged                                                                           | `../incidents/`        | Semi-annual                                        |
| CC-VEN-01   | AWS Artifact report review checklist                                              | Checklist signed                                                                         | `evidence/vendors/`    | Annual                                             |

---

## 3. Existing automation to reuse (do not replace)

| Asset              | Path / command (representative)                                             |
| ------------------ | --------------------------------------------------------------------------- |
| RLS verify         | `scripts/phase2-verify-rls.mjs` (or successor)                              |
| Headers verify     | `scripts/phase2-verify-headers.mjs`                                         |
| Isolation e2e      | `apps/rms-web-e2e` Playwright isolation specs                               |
| Secret scan        | gitleaks workflow                                                           |
| IaC nag            | cdk-nag in CI                                                               |
| Phase 2 acceptance | `docs/neris/phase-2-final-acceptance-report.md` (baseline evidence pointer) |

---

## 4. Defect handling

Failed tests → open exception in [`control-exceptions.md`](control-exceptions.md) or risk in risk register; do not silently skip.

---

## 5. NERIS constraint

Control testing for this sprint must not expand into NERIS Phase 3 feature work.
