# Rollout Plan — FX RMS Shell (S2B)

**Document:** `19-rollout-plan.md`  
**Updated:** 2026-07-30

## Sequence

1. Local development (`NEXT_PUBLIC_FX_RMS_*` overrides)
2. Automated tests (unit + Playwright matrix)
3. Internal non-production tenant override (flags still default false globally)
4. Internal administrators
5. Internal operational users
6. Selected pilot tenant
7. Expanded pilot
8. GA only after later approval — **not authorized by S2B alone**

FX flags remain default-off in seed.
