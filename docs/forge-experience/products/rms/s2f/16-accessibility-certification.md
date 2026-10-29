# 16 — Accessibility Certification (S2F-8)

**Date:** 2026-07-31  
**Target:** WCAG 2.2 AA  
**Status:** **CONDITIONAL** — design-system / code patterns certified; full manual audit pending pilot

## What was certified (code / pattern)

| Surface         | Pattern                                              | Notes                                    |
| --------------- | ---------------------------------------------------- | ---------------------------------------- |
| FX forms        | Labeled fields, required markers, validation summary | Shared `FxField` / `FxValidationSummary` |
| FX tables       | Caption + section boundary on migrated lists         | `FxTable` / `TableSectionBoundary`       |
| Shell / nav     | Existing FX shell keyboard landmarks                 | Foundation S2B                           |
| Focus / dialogs | No new modal workflows introduced in S2F             | N/A for most modules                     |

## Manual checklist (pilot — not completed in S2F-8)

| Check                                 | Status  |
| ------------------------------------- | ------- |
| Full keyboard path per migrated route | Pending |
| Screen-reader labels / live regions   | Pending |
| 200% zoom                             | Pending |
| High contrast                         | Pending |
| Reduced motion                        | Pending |
| Touch targets on mobile               | Pending |

## Certification statement

S2F FX surfaces use shared accessible primitives and preserve existing control semantics. **Formal WCAG 2.2 AA sign-off requires a manual pass on a non-prod tenant before GA**; pilot may proceed under observation with this condition tracked.
