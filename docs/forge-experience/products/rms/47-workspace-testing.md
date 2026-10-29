# 47 — Workspace Testing

**Date:** 2026-07-30

## Automated

| Suite                               | Coverage                                                  |
| ----------------------------------- | --------------------------------------------------------- |
| `workspace-flags.test.ts`           | Default off, admin wildcard ignore, env/session overrides |
| `FxWorkspaceRegistry.test.ts`       | Register, duplicate guard, tab permission filter          |
| `incident-adapters.test.ts`         | Summary/timeline/related from existing fields only        |
| `fx-s2-regression.scaffold.spec.ts` | Workspace flag matrix scaffold                            |

## Manual

Desktop / tablet / mobile · light / dark / high contrast · deep links · rollback · permission-gated Review audit.

## Local enable

```bash
NEXT_PUBLIC_FX_RMS_WORKSPACE_ENABLED=true
pnpm --filter @forge/rms-web dev
```
