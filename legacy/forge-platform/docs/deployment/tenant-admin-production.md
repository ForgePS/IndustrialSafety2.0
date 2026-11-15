# Tenant Admin — production-quality hosting (development account)

**Date:** 2026-07-28  
**Environment:** development (`511343547817` / `us-east-1`)  
**Status:** DEPLOYED

## Resources

| Resource       | Value                                                                                     |
| -------------- | ----------------------------------------------------------------------------------------- |
| CDK stack      | `Forge-Development-Frontend` (`ForgeFrontend`)                                            |
| Construct      | `ForgeTenantAdminHosting` → `ForgeStaticHosting` (`appKey=tenantadmin`)                   |
| S3 origin      | `forge-development-tenantadmin-511343547817-us-east-1` (versioned, private, SSL enforced) |
| CloudFront     | `E3O4NP8GCEEK23`                                                                          |
| Domain         | `https://d1uxdl4szvsixc.cloudfront.net`                                                   |
| OAC            | enabled (S3 origin access control)                                                        |
| HTTPS          | Viewer protocol redirect-to-https; TLS min policy on distribution                         |
| SPA routing    | CloudFront Function directory-index rewrite + 403/404 → `/index.html`                     |
| Secure headers | CSP, HSTS, XFO DENY, nosniff, referrer, Permissions-Policy                                |
| Cache          | Managed CachingOptimized policy (`658327ea-f89d-4fab-a63d-7e88639e58f6`) + compress       |

## Immutable / versioned deployment

1. `pnpm --filter @forge/tenant-admin build` (Next static export → `apps/tenant-admin/out`)
2. `pnpm deploy:tenant-admin` / `node scripts/sync-static-site.mjs --app tenantadmin`
3. Sync uses `aws s3 sync --delete` then CloudFront invalidation `/*`
4. S3 bucket versioning retains prior objects as rollback artifacts

## Rollback procedure

1. List prior object versions in the Tenant Admin bucket for the desired path/time.
2. Restore prior `index.html` / `_next/static/**` versions (or re-sync from a tagged local `out/` artifact).
3. Invalidate CloudFront:  
   `aws cloudfront create-invalidation --distribution-id E3O4NP8GCEEK23 --paths "/*"`
4. Infrastructure rollback (rare): redeploy previous Frontend stack template / remove TenantAdmin construct only via CDK with care.

## Validation (this release)

| Check          | Result                              |
| -------------- | ----------------------------------- |
| CDK deploy     | PASS (`DEPLOY_EXIT=0`)              |
| Static sync    | PASS                                |
| `GET /`        | 200                                 |
| `GET /studio/` | 200                                 |
| Modules hosted | 13 delegated studio routes exported |

## Delegated modules

Tenant Profile, Organization Profile, Branding, Navigation, Terminology, Dropdowns, Notification Templates, Email Templates, Business Hours, Holiday Calendar, Facilities, Locations, Roles.

Live API wiring uses platform API `NEXT_PUBLIC_API_URL=https://d108fstxdv69bo.cloudfront.net` (no mock-only data path in ConfigStudioWorkspace).

## Notes

- Frontend-only CDK entrypoint used for deploy: `infrastructure/cdk/bin/forge-frontend-only.ts` (avoids full-stack context hang).
- `cdk.json` app command uses local `tsx` instead of `npx tsx` for Windows reliability.
