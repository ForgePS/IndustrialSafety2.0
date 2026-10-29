# 33 — Dashboard Feature Flags

**Date:** 2026-07-30

| Flag                       | Default | Scope                           | Notes                    |
| -------------------------- | ------- | ------------------------------- | ------------------------ |
| `fx.rms.dashboard.enabled` | false   | tenant / env / session override | Independent of shell/nav |

Resolver: `resolveRmsFxDashboardFlag` — platform-admin wildcard does **not** auto-enable.

Test overrides:

- `NEXT_PUBLIC_FX_RMS_DASHBOARD_ENABLED=true`
- `sessionStorage.setItem('fx.rms.dashboard.enabled','1')`
