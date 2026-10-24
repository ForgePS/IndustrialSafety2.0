# S2F-4 CAD Connections — Rollback

1. Set `fx.rms.module.cadConnections.enabled` = false.
2. Clear `NEXT_PUBLIC_FX_RMS_MODULE_CAD_CONNECTIONS_ENABLED` / session.
3. Legacy create form + legacy table restore immediately.

Does **not** disable CAD Messages, Incidents, Incident Review, shell, nav, dashboard, workspace, forms, tables foundations, or other CAD pages.
