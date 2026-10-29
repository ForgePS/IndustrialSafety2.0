# 15 — Final Regression Report (S2F-8)

**Date:** 2026-07-31  
**Gate:** FX-S2F-8  
**Method:** Code review + automated FX unit tests + e2e scaffold presence; live manual/UI regression remains a pilot condition

## Automated results

| Suite                                                     | Result                                             |
| --------------------------------------------------------- | -------------------------------------------------- |
| `src/fx/**/*.test.ts` (13 files)                          | **66 passed**                                      |
| Module resolvers (`module-flags.test.ts`)                 | 21 passed                                          |
| Shell/nav flags (`rms-fx-flags.test.ts`)                  | 6 passed                                           |
| Forms / tables / workspace / dashboard flags + registries | Passed                                             |
| E2E scaffold `fx-s2-regression.scaffold.spec.ts`          | Present (flag-matrix smoke; CI defaults flags off) |

## Module regression matrix (code-certified)

| Module              | Routes                                               | Feature gate                     | Presentation switch             | APIs (unchanged by inspection)         | Status      |
| ------------------- | ---------------------------------------------------- | -------------------------------- | ------------------------------- | -------------------------------------- | ----------- |
| Incidents           | `/incidents/`, `/incidents/new/`, `/incidents/[id]/` | `incidentShell` / `manualIntake` | module ∧ tables/forms/workspace | Incident list/create/workspace clients | Pass (code) |
| Incident Review     | `/review/`, incident `?section=REVIEW`               | `officerReview`                  | module ∧ tables/forms           | Review queue + officer review clients  | Pass (code) |
| CAD Messages        | `/cad/messages/`                                     | `cadOperations`                  | module ∧ tables                 | `listCadMessages`                      | Pass (code) |
| CAD Connections     | `/cad/connections/`                                  | `cadEnabled`                     | module ∧ forms/tables           | list/create/enable/disable/test        | Pass (code) |
| CAD Conflicts       | `/cad/conflicts/`                                    | `cadEnabled`                     | module ∧ tables                 | list OPEN + resolve                    | Pass (code) |
| NERIS Configuration | `/configuration/`                                    | `tenantConfiguration`            | module ∧ forms                  | get/put configuration + overlays       | Pass (code) |
| Administration      | `/select-tenant/`                                    | Session auth                     | module ∧ tables                 | `chooseTenant`                         | Pass (code) |
| Utilities           | `/health/`                                           | None                             | module alone                    | `GET /health`                          | Pass (code) |

## Foundations

| Foundation | Wired                | Default off | Fail-safe                          | Status      |
| ---------- | -------------------- | ----------- | ---------------------------------- | ----------- |
| Shell      | Yes                  | Yes         | Legacy shell                       | Pass (code) |
| Navigation | Yes (requires shell) | Yes         | Invalid nav-without-shell → legacy | Pass (unit) |
| Workspace  | Yes                  | Yes         | Legacy incident chrome             | Pass (code) |
| Forms      | Yes                  | Yes         | Legacy forms                       | Pass (code) |
| Tables     | Yes                  | Yes         | Legacy tables                      | Pass (code) |
| Dashboard  | Yes (S2C; ambient)   | Yes         | Legacy home                        | Pass (code) |

## Failures / defects found in S2F-8

| Sev            | Count | Notes                                                                |
| -------------- | ----- | -------------------------------------------------------------------- |
| P0             | 0     | None discovered                                                      |
| P1 (migration) | 0     | None discovered                                                      |
| P3             | Open  | Sanitized screenshots / full manual UI matrix pending across modules |

## Not fully exercised in this phase

- Live browser regression on authenticated multi-tenant data
- Destructive CAD resolve / connection enable actions against non-prod tenants
- Full Playwright execution with all flag combinations enabled

These remain **pilot entry conditions**, not unresolved migration P1s from code inspection.
