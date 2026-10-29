# Rollback Plan — FX RMS Shell (S2B)

**Document:** `20-rollback-plan.md`  
**Updated:** 2026-07-30

## Immediate rollback

1. Set `fx.rms.navigation.enabled` = false (or clear session/env override)
2. Set `fx.rms.shell.enabled` = false
3. Reload — `RmsShellBoundary` renders `RmsLegacyShellAdapter`

## Preserved on rollback

Current route (URL unchanged), query params, session, tenant context, drafts (page-owned), attachments, audit history.

## Test matrix (manual / e2e with env)

Home · Incident list · Incident detail · CAD · NERIS config · soft-auth · mobile · deep link — disable flags → `data-testid="rms-legacy-shell"` visible.
