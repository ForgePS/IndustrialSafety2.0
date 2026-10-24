# 49 — Workspace Rollback

**Date:** 2026-07-30

1. Set `fx.rms.workspace.enabled` = false (clear env/session overrides).
2. Reload `/incidents/{id}/` — legacy `IncidentWorkspaceLayout` restores immediately.
3. Preserved: URLs (`?section=`), drafts (local autosave keys), attachments, history, tenant, session.
4. No data migration; presentation only.

Unit coverage: `resolveRmsFxWorkspaceFlag` defaults false.
