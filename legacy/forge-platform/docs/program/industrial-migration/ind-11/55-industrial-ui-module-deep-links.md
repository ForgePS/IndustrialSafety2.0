# Industrial UI — unblock Aurora module deep links

**Date:** 2026-08-05  
**Scope:** development Industrial CloudFront + industrial-web static + creator Tenant A access

## Root cause

CloudFront viewer-request rewrote every `/modules/{code}/` (except `placeholder`) to `/modules/placeholder/index.html`. Browser URL stayed `/modules/equipment/` etc., but RSC hydrated `ModuleUnavailable` even when workspaces and tenant flags were ready.

## Fixes

1. Removed `dynamicPathPrefixes: ["modules"]` from `ForgeIndustrialHosting` — directory index rewrite alone serves `/modules/{code}/index.html`.
2. Wired `PersonnelWorkspace` for `/modules/personnel/`.
3. Aligned industrial-web `FLAG_BY_CODE` with platform-api module flag map.
4. Extended creator link entitlements: QR_LINKS, TASKS, MESSAGING, EMERGENCY_RESPONSE, DOCUMENTS, REPORTING, IMPORT.
5. Link script now **reuses** an existing Cognito-linked user (`ba491113…` on home tenant `019f9c33…`) for Tenant A membership/module access — does not rewrite `authentication_identities`.

## Deploy

```text
# CF function: modules rewrite removed (published LIVE)
# Static: pnpm deploy:industrial-web
FORGE_ENV=development npx cdk deploy ForgeFrontend -a "npx tsx bin/forge-frontend-only.ts" --require-approval never --output cdk.out-frontend-fix
FORGE_P1_LINK_COGNITO_SUB=e498c4d8-f091-7083-0ac4-ad145fe79b39 node scripts/ind11b-p1-run-link-creator.mjs
node scripts/ind11b-p1-run-enable-flags.mjs
node scripts/ind11b-p1-api-smoke-tenant-a.mjs
```

## UI smoke (static)

| URL                   | Result                                   |
| --------------------- | ---------------------------------------- |
| `/modules/equipment/` | **EquipmentWorkspace** (not placeholder) |
| `/modules/loto/`      | **LotoWorkspace**                        |
| `/modules/personnel/` | **PersonnelWorkspace**                   |

Live UI: https://d2ed3566n8x2gi.cloudfront.net/  
Evidence HTML under `evidence/wave3/smoke-*.html`.

## Entitlements + API smoke

- Link job: `userReuse=true`, `modulesEntitled=32`, identity `reused` (no Cognito rebind).
- Flags job: `enabledCount=36` industrial keys on Tenant A.
- API smoke (`evidence/wave3/api-smoke-tenant-a.json`): all **200/201**
  - `/auth/me` lists both home + Tenant A memberships
  - `select-tenant` → Tenant A yields industrial permissions
  - `/industrial/personnel|equipment|loto?limit=3` return Firebase-sourced Producers rows

**Auth note:** Cognito identity home remains `forge-platform` (`019f9c33…`). Active Tenant A requires `x-tenant-id` (persisted as `forge-active-tenant-id` after choose-tenant). industrial-web “not entitled” gate offers alternate tenant switch + sign out.

## Signed-in browser smoke (2026-08-05)

After web-kit tenant stickiness deploy (invalidation `ICQM3QXKQAX9ONOZV56BEXJYKB`):

| Step                           | Result                                                      |
| ------------------------------ | ----------------------------------------------------------- |
| Cognito session on home tenant | Not entitled gate + **Import Acceptance Tenant A** switcher |
| Persist Tenant A + reload      | Dashboard: Tenant A, full industrial nav                    |
| `/modules/personnel/`          | Roster rows (Producers names)                               |
| `/modules/equipment/`          | Assets (e.g. 201 Diverter Valve)                            |
| `/modules/loto/`               | Procedures (e.g. LOTO-CON-2026-0012)                        |
| `/modules/training/`           | Workspace OK                                                |
| `/modules/forms/`              | Workspace OK (ACTIVE rows)                                  |
| `/modules/inspections/`        | Workspace OK (DRAFT rows)                                   |
| `/modules/incidents/`          | Workspace OK (OPEN rows)                                    |
| `/modules/qr-links/`           | Workspace OK                                                |
| `/modules/confined-space/`     | Workspace OK                                                |
| `/modules/hot-work/`           | Workspace OK (sample DRAFT)                                 |

Evidence: `evidence/wave3/browser-smoke-extra-modules.json`.

Still deferred: Cognito Firebase import, Storage→S3 blobs, production SoT cutover.
