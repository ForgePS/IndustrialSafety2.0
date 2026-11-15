# CORS hotfix — Producers hostname

**Date:** 2026-08-05  
**Trigger:** Browser smoke on `https://producers-rice-mill.forgepublicsafety.com/` failed with “Failed to fetch” after Cognito callback (missing API CORS origin).

## Applied

| Item | Value |
|------|-------|
| Previous task def | `forge-development-ecs-platform-api:64` |
| New task def | `forge-development-ecs-platform-api:65` |
| Cluster / service | `forge-development-ecs-platform` / `forge-development-ecs-platform-api` |
| Origin added | `https://producers-rice-mill.forgepublicsafety.com` |
| Rollout | COMPLETED (1/1 running on :65) |

Durable CDK: `infrastructure/cdk/bin/forge-platform.ts` — `publicProducersIndustrialUrl` in `browserOrigins` → `CORS_ORIGINS`.

Hotfix script: `scripts/ind11b-p2-hotfix-cors-producers.mjs`

## Preflight evidence

```
OPTIONS https://d108fstxdv69bo.cloudfront.net/auth/me
Origin: https://producers-rice-mill.forgepublicsafety.com
→ 204
Access-Control-Allow-Origin: https://producers-rice-mill.forgepublicsafety.com
Access-Control-Allow-Credentials: true
```

## Next

Retry browser sign-in smoke on Producers flat host (not production cutover).
