# S2F-6 NERIS Configuration — Rollback

1. Set `fx.rms.module.nerisConfiguration.enabled` = false.
2. Clear `NEXT_PUBLIC_FX_RMS_MODULE_NERIS_CONFIGURATION_ENABLED` / session.
3. Legacy configuration forms restore immediately.

Does **not** disable Incidents, Incident Review, CAD modules, shell, nav, forms foundation, or tables.
