# 64 — Rollback (Forms & Tables)

**Date:** 2026-07-30

1. Set `fx.rms.forms.enabled` and/or `fx.rms.tables.enabled` to false; clear env/session overrides.
2. Reload affected routes — legacy markup restores immediately.
3. Preserved: URLs, drafts, sessions, attachments, history, filters, sorting, current page.
