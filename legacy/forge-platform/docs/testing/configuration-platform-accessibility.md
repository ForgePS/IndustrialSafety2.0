# Configuration Platform — accessibility (manual WCAG + automated)

**Date:** 2026-07-28  
**Surfaces:** Creator Console Studio, Tenant Admin Studio  
**Automated evidence:** `docs/testing/evidence/config-final-acceptance/playwright-config-e2e.log`  
**Related:** `docs/testing/configuration-platform-accessibility-report.md`

## Automated totals

| Suite                                          | Passed     | Failed | Skipped |
| ---------------------------------------------- | ---------- | ------ | ------- |
| Playwright config e2e (axe + smoke)            | **5**      | **0**  | **0**   |
| Axe critical — Creator `/studio/branding`      | 0 critical | —      | —       |
| Axe critical — Tenant Admin `/studio/branding` | 0 critical | —      | —       |

## Manual WCAG 2.2 AA checklist (spot / release readiness)

| Criterion                    | Check                                       | Status              | Notes                                                                          |
| ---------------------------- | ------------------------------------------- | ------------------- | ------------------------------------------------------------------------------ |
| 1.3.1 Info and Relationships | Studio chrome landmarks / headings          | Partial             | Branding module structure OK in smoke; JSON editor lacks code-editor semantics |
| 1.4.3 Contrast (Minimum)     | Primary text/controls on studio             | Partial             | Default theme; forced-colors / high-contrast not re-measured                   |
| 1.4.4 Resize text            | 200% zoom usable                            | Not fully re-tested | Layout loads; dense JSON panels may clip                                       |
| 2.1.1 Keyboard               | Tab through studio nav + module actions     | Partial             | Smoke keyboard path only; schedule/rollback dialogs not exhaustively matrixed  |
| 2.4.3 Focus Order            | Logical tab order in branding / terminology | Partial             | Relies on DOM order                                                            |
| 2.4.7 Focus Visible          | Visible focus on interactive controls       | Partial             | Browser/default CSS; no custom focus ring audit                                |
| 3.2.2 On Input               | No unexpected context change on field edit  | Pass (spot)         | Draft save is explicit action                                                  |
| 4.1.2 Name, Role, Value      | Controls named for AT                       | Partial             | Textareas / compare tables need stronger roles                                 |
| 4.1.3 Status Messages        | Save/publish/error announcements            | Partial             | API errors surface in UI; live region coverage not proven                      |

## Residual findings

| Finding                                      | Severity                              |
| -------------------------------------------- | ------------------------------------- |
| JSON editor not announced as code editor     | Medium                                |
| Version timeline / compare table semantics   | Medium                                |
| Full keyboard matrix for schedule / rollback | Medium                                |
| Contrast under forced colors / 200% zoom     | Low                                   |
| Drag-drop alternatives                       | Low (N/A — rich builders not shipped) |

## Totals

|                             |                         |
| --------------------------- | ----------------------- |
| Automated critical failures | **0**                   |
| Automated suite failed      | **0**                   |
| Manual WCAG matrix complete | **No** (spot / partial) |

**Verdict:** Automated critical bar PASS. Manual WCAG 2.2 AA matrix remains incomplete → acceptance limitation.
