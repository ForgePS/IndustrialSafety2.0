# 39 — Workspace Registry

**Date:** 2026-07-30  
**Code:** `apps/rms-web/src/fx/workspace/FxWorkspaceRegistry.ts`

| ID             | Record type | Title              | Feature flag               | Notes                    |
| -------------- | ----------- | ------------------ | -------------------------- | ------------------------ |
| `rms-incident` | incident    | Incident workspace | `fx.rms.workspace.enabled` | Reference implementation |

Workspaces register via `registerWorkspace` / `ensureWorkspacesRegistered()`. Routing remains Next.js file routes; registry is metadata + authorization, not a router.

## Supported tabs (Incident)

Live tabs come from the form descriptor `navigationSections` (same as legacy). Registry lists common anchors: Overview, Narrative, Attachments, Review. Specialty sections appear only when the descriptor exposes them.
