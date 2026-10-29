# 34 — Dashboard Testing

**Date:** 2026-07-30

## Automated

| Suite                               | Coverage                                          |
| ----------------------------------- | ------------------------------------------------- |
| `dashboard-flags.test.ts`           | Default-off, admin ignore, env override           |
| `DashboardRegistry.test.ts`         | Live widgets only, permission filter, preferences |
| `pnpm --filter @forge/rms-web test` | 28 passing including S2C                          |
| Production build                    | Pass                                              |

## Manual (before pilot)

Desktop/tablet/mobile · light/dark/HC · loading/empty/error · hide widget · reset layout · rollback flag off.
