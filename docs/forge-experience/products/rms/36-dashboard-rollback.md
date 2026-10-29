# 36 — Dashboard Rollback

**Date:** 2026-07-30

1. Set `fx.rms.dashboard.enabled` = false (clear env/session overrides)
2. Reload `/`
3. Confirm `data-testid="rms-legacy-dashboard"`

Preserves route, session, tenant, drafts, attachments, audit history. Local widget preferences may remain in `localStorage` but do not affect legacy home.
