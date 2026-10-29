# S2F-2 Incident Review — Rollback

1. Set `fx.rms.module.incidentReview.enabled` = false.
2. Clear `NEXT_PUBLIC_FX_RMS_MODULE_INCIDENT_REVIEW_ENABLED` / session override.
3. Queue and officer review forms restore legacy immediately.

Does **not** disable: Incident module, shell, nav, dashboard, workspace, forms, tables foundations (foundations may remain on for other modules).
