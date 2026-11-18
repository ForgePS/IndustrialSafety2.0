# Configuration Platform accessibility report

**Date:** 2026-07-28  
**Method:** Playwright + `@axe-core/playwright` (wcag2a / wcag2aa / wcag22aa tags) against live CloudFront  
**Suite:** `apps/configuration-e2e/tests/accessibility.spec.ts`  
**Evidence:** `docs/testing/evidence/config-final-acceptance/playwright-config-e2e.log`  
**Manual WCAG matrix:** `docs/testing/configuration-platform-accessibility.md`

## Automated results

| Surface                           | Critical | Result                    |
| --------------------------------- | -------- | ------------------------- |
| Creator Studio `/studio/branding` | 0        | PASS (axe critical empty) |
| Tenant Admin `/studio/branding`   | 0        | PASS (axe critical empty) |

Playwright a11y+smoke suite: **5 passed / 0 failed / 0 skipped**.

## Classification of remaining findings

| Finding                                            | Severity | Notes                                 |
| -------------------------------------------------- | -------- | ------------------------------------- |
| JSON editor not announced as code editor to SR     | Medium   | Shared textarea; add aria description |
| Version timeline / compare table semantics         | Medium   | Prefer table headers / list roles     |
| Full keyboard matrix for schedule/rollback dialogs | Medium   | Manual pass not exhaustively recorded |
| Contrast under forced colors / 200% zoom           | Low      | Not separately measured this sprint   |
| Drag-drop alternatives                             | Low      | N/A — rich builders not shipped       |

## Manual checks (spot)

| Check                              | Status                                                                            |
| ---------------------------------- | --------------------------------------------------------------------------------- |
| Keyboard tab through studio chrome | Partial (smoke only)                                                              |
| Visible focus                      | Relies on browser/default CSS                                                     |
| Accessible dialogs                 | Studio uses inline panels more than modal dialogs                                 |
| Zoom / responsive                  | Tenant Admin + Creator static layouts load on mobile viewport not fully re-tested |

**Verdict:** Automated critical bar PASS; full WCAG 2.2 AA manual matrix remains a Medium residual risk → acceptance limitation if ACCEPTED requires exhaustive manual evidence.
