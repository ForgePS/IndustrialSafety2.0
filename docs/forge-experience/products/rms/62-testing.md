# 62 — Testing (Forms & Tables)

**Date:** 2026-07-30

## Automated

| Suite                     | Coverage                      |
| ------------------------- | ----------------------------- |
| `forms-flags.test.ts`     | Default off / admin / env     |
| `FxFormRegistry.test.ts`  | Register / duplicate          |
| `tables-flags.test.ts`    | Default off / admin / session |
| `FxTableRegistry.test.ts` | Register + column prefs       |

## Manual

Desktop/tablet/mobile · light/dark/high contrast · rollback · physical device spot-check.

## Local enable

```bash
NEXT_PUBLIC_FX_RMS_FORMS_ENABLED=true
NEXT_PUBLIC_FX_RMS_TABLES_ENABLED=true
pnpm --filter @forge/rms-web dev
```
