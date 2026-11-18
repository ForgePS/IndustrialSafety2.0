# Import Platform S8 — Accessibility

**Document:** `docs/testing/import-platform-s8-accessibility.md`  
**Surface:** `@forge/import-center` in Creator Console + Tenant Admin  
**Date:** 2026-07-30  
**Status:** Closeout run **FAILED**; authorized axe/keyboard evidence **NOT_VERIFIED**

## Honest baseline

| Item                                 | Status                                                                                                             |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Playwright + axe Import Center suite | **ADDED** — `apps/configuration-e2e/tests/import-center-s8.spec.ts` (axe critical/serious on dashboard; landmarks) |
| Recorded run                         | **FAIL** — 7 tests ran: 4 passed, 3 failed; authorized dashboard was unavailable and axe did not run               |
| Full keyboard-only workflow          | **NOT_VERIFIED**                                                                                                   |
| Unit tests                           | Do not prove a11y                                                                                                  |

Evidence: docs/testing/evidence/import-platform/s8-playwright-import-center.json.

DEF-S8-005 remains **OPEN**: the dashboard axe precondition failed, and no full keyboard-only create-upload-execute workflow is covered.

Track under LIM-IMP-011 (and LIM-IMP-008 for narrow screens).

## Requirements (must pass before closing LIM-IMP-011)

### Keyboard

| Requirement       | Detail                                                 |
| ----------------- | ------------------------------------------------------ |
| Reachability      | All interactive controls reachable via Tab / Shift+Tab |
| Activation        | Enter/Space; no keyboard trap                          |
| Focus order       | Logical; focus visible                                 |
| Execution monitor | Polling must not steal focus every 3s                  |

### Screen reader / semantics

| Requirement       | Detail                      |
| ----------------- | --------------------------- |
| Headings          | One logical h1 per view     |
| Labels            | Associated labels on inputs |
| Status            | Async status announced      |
| Errors            | Not color-only              |
| Disabled controls | Reason available to AT      |

### axe / WCAG target

| Target                         | Notes                                                              |
| ------------------------------ | ------------------------------------------------------------------ |
| WCAG 2.2 AA (practical subset) | axe on dashboard, mapping, security/quarantine, execution, results |
| Critical/Serious               | Zero open for acceptance                                           |
| Moderate                       | Triaged                                                            |

### Responsive

| Viewport         | Expectation                                 |
| ---------------- | ------------------------------------------- |
| Desktop / tablet | Primary supported                           |
| Narrow phone     | Residual LIM-IMP-008 if mapping constrained |

## Suite vs full workflow

Current Playwright a11y case is **dashboard surface only** — not full import workflow keyboard tour.

## Exit criteria

LIM-IMP-011 → CLOSED only with attached browser evidence (axe JSON + notes). Until then **OPEN**.
