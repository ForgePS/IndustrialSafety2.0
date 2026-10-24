# Forge RMS × Forge Experience

**Product:** Forge RMS (`@forge/rms-web`)  
**Program phase:** FX-S2 — Controlled migration to Design System `v1.0.0-RC1`  
**Current gate:** FX-S2F-3 — CAD Messages (checkpoint submitted)  
**Status:** S2A–S2E complete · S2F-1–3 awaiting acceptance for S2F-4  
**Last Updated:** 2026-07-31

## Purpose

This folder is the authoritative migration baseline and evidence home for adopting Forge Experience in Forge RMS. It does **not** authorize uncontrolled rewrites.

## Rules

- Business logic remains RMS-owned (API, permissions, NERIS, CAD).
- FX owns shared presentation and interaction foundation (`@forge/fx-*`).
- Visible production migration starts only after **FX-S2A approval** and subsequent gate authorizations (S2B+).
- Every migrated area requires a feature flag, tests, and rollback path.

## Document index

| Doc                                                                                     | Title                            |
| --------------------------------------------------------------------------------------- | -------------------------------- |
| [00-fx-s2-charter.md](./00-fx-s2-charter.md)                                            | FX-S2 charter                    |
| [01-current-state-baseline.md](./01-current-state-baseline.md)                          | Current-state baseline           |
| [02-route-inventory.md](./02-route-inventory.md)                                        | Route inventory                  |
| [03-screen-inventory.md](./03-screen-inventory.md)                                      | Screen inventory                 |
| [04-component-inventory.md](./04-component-inventory.md)                                | Component inventory              |
| [05-component-classification.md](./05-component-classification.md)                      | Classifications                  |
| [06-navigation-migration.md](./06-navigation-migration.md)                              | Navigation plan (S2B)            |
| [07-shell-migration.md](./07-shell-migration.md)                                        | Shell plan (S2B)                 |
| [08-dashboard-migration.md](./08-dashboard-migration.md)                                | Dashboard plan (S2C)             |
| [09-workspace-migration.md](./09-workspace-migration.md)                                | Workspace plan (S2D)             |
| [10-form-migration.md](./10-form-migration.md)                                          | Forms plan (S2E)                 |
| [11-table-migration.md](./11-table-migration.md)                                        | Tables plan (S2E)                |
| [12-search-migration.md](./12-search-migration.md)                                      | Search plan                      |
| [13-notification-migration.md](./13-notification-migration.md)                          | Notifications plan               |
| [14-mobile-migration.md](./14-mobile-migration.md)                                      | Mobile plan                      |
| [15-accessibility-validation.md](./15-accessibility-validation.md)                      | A11y requirements                |
| [16-permission-validation.md](./16-permission-validation.md)                            | Permission map                   |
| [17-regression-plan.md](./17-regression-plan.md)                                        | Regression plan                  |
| [18-feature-flag-plan.md](./18-feature-flag-plan.md)                                    | Feature-flag plan                |
| [19-rollout-plan.md](./19-rollout-plan.md)                                              | Rollout plan                     |
| [20-rollback-plan.md](./20-rollback-plan.md)                                            | Rollback plan                    |
| [21-legacy-retirement-plan.md](./21-legacy-retirement-plan.md)                          | Legacy retirement                |
| [22-risk-register.md](./22-risk-register.md)                                            | Risks                            |
| [23-decision-register.md](./23-decision-register.md)                                    | Decisions                        |
| [24-evidence-index.md](./24-evidence-index.md)                                          | Evidence index                   |
| [25-migration-readiness.md](./25-migration-readiness.md)                                | Readiness                        |
| [26-acceptance-criteria.md](./26-acceptance-criteria.md)                                | Acceptance                       |
| [27-fx-s2b-completion-report.md](./27-fx-s2b-completion-report.md)                      | S2B decision report              |
| [28–37 dashboard docs](./28-dashboard-widget-registry.md)                               | S2C dashboard package            |
| [38-dashboard-completion-report.md](./38-dashboard-completion-report.md)                | S2C decision report              |
| [39–50 workspace docs](./39-workspace-registry.md)                                      | S2D workspace package            |
| [51-workspace-completion-report.md](./51-workspace-completion-report.md)                | S2D decision report              |
| [52–65 forms/tables docs](./52-form-registry.md)                                        | S2E package                      |
| [66-fx-s2e-completion-report.md](./66-fx-s2e-completion-report.md)                      | S2E decision report              |
| [s2f/](./s2f/README.md)                                                                 | S2F operational module migration |
| [s2f Incidents checkpoint](./s2f/modules/incidents/09-completion-report.md)             | S2F-1 decision report            |
| [s2f Incident Review checkpoint](./s2f/modules/incident-review/09-completion-report.md) | S2F-2 decision report            |
| [s2f CAD Messages checkpoint](./s2f/modules/cad-messages/09-completion-report.md)       | S2F-3 decision report            |
| [evidence/](./evidence/)                                                                | Evidence package                 |
| [FX-S2A-completion-report.md](./evidence/FX-S2A-completion-report.md)                   | S2A decision report              |

## Source application

| Item        | Value                                                                            |
| ----------- | -------------------------------------------------------------------------------- |
| App         | `apps/rms-web`                                                                   |
| Package     | `@forge/rms-web`                                                                 |
| Port        | 3002                                                                             |
| Stack today | Next.js 15 static export + `@forge/design-system` + `@forge/web-kit` + local CSS |
| FX packages | **Not consumed yet** (S2B+)                                                      |

## Related program docs

- [VERSION.md](../../VERSION.md) — RC1
- [44-component-registry.md](../../44-component-registry.md) — shared registry
- [39-component-governance.md](../../39-component-governance.md)
- [42-migration-readiness.md](../../42-migration-readiness.md)
