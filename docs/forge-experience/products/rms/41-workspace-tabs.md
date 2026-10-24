# 41 — Workspace Tabs

**Date:** 2026-07-30  
**Code:** `apps/rms-web/src/fx/workspace/FxWorkspaceTabs.tsx`

| Requirement   | Implementation                                                             |
| ------------- | -------------------------------------------------------------------------- |
| Deep links    | `?section=` remains source of truth; tab change → `router.push`            |
| Keyboard      | Arrow Left/Right, Home/End; `role="tablist"` / `tab`                       |
| Overflow      | Horizontal scroll via shared `.fx-workspace__tabs`                         |
| Permissions   | `filterAuthorizedTabs` available for future tab-level gates                |
| Feature flags | Tab defs may carry `featureFlag`; Incident uses descriptor-driven sections |

URL paths are unchanged (`/incidents/{id}/`). Unused query params `field` / `ref` remain emitted by review links and are not consumed.
