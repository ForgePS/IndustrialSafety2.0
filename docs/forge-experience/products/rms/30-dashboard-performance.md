# 30 — Dashboard Performance

**Date:** 2026-07-30

| Requirement                | Approach                                                             |
| -------------------------- | -------------------------------------------------------------------- |
| Avoid blocking page render | Flag resolves → legacy or dashboard; widgets load data independently |
| Isolate failures           | `WidgetErrorBoundary` per widget                                     |
| Lazy / progressive         | Suspense + per-widget fetch; no page-wide spinner for all widgets    |
| No polling                 | Manual refresh only                                                  |
| Shell responsiveness       | Dashboard does not alter shell flags                                 |

One failed widget cannot crash the page.
