# Configuration Platform Playwright (release readiness)

Minimal live UI smoke for Creator Studio + Tenant Admin against CloudFront.
Uses Chromium only. Dev principal via localStorage (development consoles).

## Run

```bash
cd apps/configuration-e2e
pnpm install
pnpm exec playwright install chromium
pnpm test
```

Env:

- `CREATOR_BASE_URL` default `https://ddztl9s33wu40.cloudfront.net`
- `TENANT_ADMIN_BASE_URL` default `https://d1uxdl4szvsixc.cloudfront.net`
- `FORGE_E2E_USER_ID` / `FORGE_E2E_TENANT_ID` (platform admin)
- `FORGE_E2E_TARGET_TENANT` (tenant for studio querystring)
