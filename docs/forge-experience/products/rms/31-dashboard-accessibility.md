# 31 — Dashboard Accessibility

**Date:** 2026-07-30  
**Target:** WCAG 2.2 AA

| Check                 | Result                                                          |
| --------------------- | --------------------------------------------------------------- |
| Widget headings       | `h3` in header                                                  |
| Loading announcements | `aria-busy` / `aria-live`                                       |
| Error announcements   | `role="alert"`                                                  |
| Empty states          | `role="status"`                                                 |
| Keyboard              | Links/buttons focusable; refresh/hide controls                  |
| Reduced motion        | Inherits FX token motion rules                                  |
| Themes                | Uses FX tokens (light/dark/HC via shell theme when FX shell on) |
| Touch targets         | Controls use min 44px where applicable                          |

Manual screen-reader pass recommended before pilot enablement.
