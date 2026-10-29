# 61 — Feature Flags (Forms & Tables)

**Date:** 2026-07-30

| Flag                    | Default | Independent of                           |
| ----------------------- | ------- | ---------------------------------------- |
| `fx.rms.forms.enabled`  | false   | shell, nav, dashboard, workspace, tables |
| `fx.rms.tables.enabled` | false   | shell, nav, dashboard, workspace, forms  |

Overrides: `NEXT_PUBLIC_FX_RMS_FORMS_ENABLED` / `NEXT_PUBLIC_FX_RMS_TABLES_ENABLED` or sessionStorage `"1"`. Platform-admin wildcard does **not** auto-enable.
