# S2F-1 Incidents — Rollback

1. Set `fx.rms.module.incidents.enabled` = false (clear `NEXT_PUBLIC_FX_RMS_MODULE_INCIDENTS_ENABLED` / session).
2. Optionally leave foundation flags as-is — module off forces legacy incident surfaces.
3. Preserve URLs, `?section=`, drafts (`localStorage` autosave keys), session, tenant.

Legacy `IncidentWorkspaceLayout` / form / table markup remain in tree.
