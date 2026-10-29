# 45 — Workspace Accessibility

**Date:** 2026-07-30  
**Target:** WCAG 2.2 AA

| Area              | Notes                                                                     |
| ----------------- | ------------------------------------------------------------------------- |
| Tabs              | `role="tablist"`, `aria-selected`, keyboard arrows                        |
| Tab panel         | `aria-labelledby` tied to active tab                                      |
| Loading           | `role="status"` / `aria-busy` on `FxWorkspaceLoading`                     |
| Errors            | `role="alert"` on `FxWorkspaceError`; section boundaries isolate failures |
| Headings          | Header `h1`; sidebar panel `h2`                                           |
| Focus             | Sticky header does not trap focus; tab focus moves with arrow keys        |
| Contrast / motion | Token-driven colors; skeleton respects `prefers-reduced-motion`           |

Manual matrix: desktop / tablet / mobile × light / dark / high contrast (evidence package).
