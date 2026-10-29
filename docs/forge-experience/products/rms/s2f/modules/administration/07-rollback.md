# S2F-7 Administration & Utilities — Rollback

1. Set `fx.rms.module.administration.enabled` = false → legacy `/select-tenant/`.
2. Set `fx.rms.module.utilities.enabled` = false → legacy `/health/`.
3. Clear corresponding `NEXT_PUBLIC_FX_RMS_MODULE_*` / session overrides.

Flags are independent. Rollback does **not** affect Incidents, Incident Review, CAD modules, NERIS Configuration, shell, nav, forms, or tables foundations.
