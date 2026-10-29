# 22 — Final Evidence Index (S2F-8)

**Date:** 2026-07-31

## Program docs

| Artifact                    | Path                                             |
| --------------------------- | ------------------------------------------------ |
| Charter                     | `00-s2f-charter.md`                              |
| Module inventory            | `01-module-inventory.md`                         |
| Dependency map              | `02-module-dependency-map.md`                    |
| Flag matrix (working)       | `03-feature-flag-matrix.md`                      |
| Flag matrix (final)         | `18-feature-flag-matrix-final.md`                |
| Regression (final)          | `15-final-regression-report.md`                  |
| Accessibility certification | `16-accessibility-certification.md`              |
| Performance summary         | `17-performance-summary.md`                      |
| Rollback certification      | `19-rollback-certification.md`                   |
| Production readiness        | `20-production-readiness-review.md`              |
| Technical debt              | `21-technical-debt-register.md`                  |
| Executive summary           | `23-final-executive-summary.md`                  |
| Closeout                    | `24-s2f-closeout-report.md`                      |
| Risk / decision registers   | `12-risk-register.md`, `13-decision-register.md` |

## Module checkpoints

| Module                     | Completion report                                     |
| -------------------------- | ----------------------------------------------------- |
| Incidents                  | `modules/incidents/09-completion-report.md`           |
| Incident Review            | `modules/incident-review/09-completion-report.md`     |
| CAD Messages               | `modules/cad-messages/09-completion-report.md`        |
| CAD Connections            | `modules/cad-connections/09-completion-report.md`     |
| CAD Conflicts              | `modules/cad-conflicts/09-completion-report.md`       |
| NERIS Configuration        | `modules/neris-configuration/09-completion-report.md` |
| Administration & Utilities | `modules/administration/09-completion-report.md`      |

## Automated evidence

| Item                                | Location                                                   |
| ----------------------------------- | ---------------------------------------------------------- |
| FX unit tests (66 pass, 2026-07-31) | `apps/rms-web/src/fx/**/*.test.ts`                         |
| E2E scaffold                        | `apps/rms-web-e2e/tests/fx-s2-regression.scaffold.spec.ts` |

## Pending attachments (pilot)

| Item                                                  | Target folder           |
| ----------------------------------------------------- | ----------------------- |
| Sanitized screenshots (desktop/tablet/mobile, themes) | `evidence/screenshots/` |
| Manual a11y / responsive checklists                   | `evidence/`             |
| Performance captures                                  | `evidence/`             |
| Live rollback before/after                            | `evidence/`             |
