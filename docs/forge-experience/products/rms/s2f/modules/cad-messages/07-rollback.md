# S2F-3 CAD Messages — Rollback

1. Set `fx.rms.module.cadMessages.enabled` = false.
2. Clear `NEXT_PUBLIC_FX_RMS_MODULE_CAD_MESSAGES_ENABLED` / session.
3. Legacy table restores immediately.

Does **not** disable Incidents, Incident Review, shell, nav, dashboard, workspace, forms, tables foundations, or other CAD pages.
