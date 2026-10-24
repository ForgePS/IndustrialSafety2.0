# S2F-5 CAD Conflicts — Rollback

1. Set `fx.rms.module.cadConflicts.enabled` = false.
2. Clear `NEXT_PUBLIC_FX_RMS_MODULE_CAD_CONFLICTS_ENABLED` / session.
3. Legacy table restores immediately.

Does **not** disable CAD Connections, CAD Messages, Incidents, Incident Review, shell, nav, dashboard, workspace, forms, tables foundations, or other CAD pages.
