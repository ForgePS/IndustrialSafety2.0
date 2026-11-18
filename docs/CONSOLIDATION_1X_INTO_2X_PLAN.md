# Consolidating Forge Platform 1.0 into Industrial Safety 2.0

Status: step 1 done (1.0 imported). This plan replaces `INTEGRATION_2X_INTO_1X_PLAN.md`, which went the other way.

## Decision (2026-11-15)

2.0 becomes the main platform. 1.0 comes into this repository and keeps running as it does today. Its modules are then rebuilt natively in 2.0, one at a time, until nothing depends on the legacy tree.

## Where things are

| What | Where |
|---|---|
| 1.0 inside 2.0 | `legacy/forge-platform/`, imported with full history by `git subtree` from Forge-Platform `master` at `ee7389cf` |
| Standalone copy of 1.0 | `C:\Users\jerem\Projects\forge-platform-copy`: every branch, remote `github` points at ForgePS/Forge-Platform |
| Original 1.0 checkout | `C:\Users\jerem\Projects\forge-platform`, unchanged |

The legacy tree is its own pnpm workspace (pnpm 10.12.1, Node ≥ 20). It is not part of 2.0's workspace (pnpm 9, `apps/*` and `packages/*`), turbo pipeline or prettier run. Use the root scripts:

```
pnpm legacy:install
pnpm legacy:build
pnpm legacy:typecheck
pnpm legacy:test
pnpm legacy:dev
```

Checked on 2026-11-15: `legacy:install` and `legacy:build` pass from the new location (53/53 turbo tasks). creator-console's static export needs `NEXT_PUBLIC_API_URL` set. Use an empty value for same-origin `/api`, as deploys do, e.g. `NEXT_PUBLIC_API_URL= pnpm legacy:build`. Without it the export fails, the same as in the original checkout.

To pull later 1.0 changes in while both are live:

```
git subtree pull --prefix=legacy/forge-platform https://github.com/ForgePS/Forge-Platform.git master
```

1.0's GitHub Actions now sit at `legacy/forge-platform/.github`, where GitHub does not run them. Its CI keeps running in the Forge-Platform repository until that repository is retired.

## What "all features combined" covers

1.0 is more than Industrial Safety:

| 1.0 app | What it is | Destination in 2.0 |
|---|---|---|
| industrial-web, field-web | Industrial Safety desktop + field PWA | Native 2.0 modules (parity matrix) |
| creator-console, tenant-admin | Configuration and tenant administration | Creator 2.0 + 2.0 admin |
| platform-api, worker-service, ai-narrative-api | NestJS API, SQS worker, AI service | 2.0 server actions/routes, a 2.0 job runner, 2.0 Forge AI |
| rms-web, department-portal, public-registration | Records management and public-safety portals | **Open question:** port into 2.0 or keep as legacy apps |
| academy-web, student-portal | Academy/LMS for public safety | **Open question:** fold into 2.0 Training LMS (slice 3) or keep |
| forge-printer-bridge | Local printer/Bluetooth bridge | Keep as-is; point it at 2.0 endpoints |
| infrastructure/cdk | AWS (ECS, Aurora, Cognito, S3, CloudFront) | Decide 2.0's hosting (below) |

## Phases

1. **Import (done).** 1.0 lives in `legacy/forge-platform` and builds and runs from there.
2. **Pick the shared foundation.** Decide hosting, identity and database for the combined product. Today 2.0 runs on Supabase (Auth, Postgres, Storage) and 1.0 on AWS (Cognito, Aurora, S3). The portability work already on this branch (phase 0, and phase 1's Cognito sign-in) is still useful if 2.0 is to run on AWS.
3. **Industrial parity, slice by slice.** Keep going with `INDUSTRIAL_1X_2X_PARITY_MATRIX.md`. Slices S0–S3 (personnel, OSHA, workers' comp, training LMS) are on this branch. The matrix still lists OSHA and workers' comp as MISSING and needs updating. Next, in priority order:
   - P0/P1 FOUNDATION: Corrective Actions, Forms, Scan
   - P2: Document Control, Reporting, Emergency Response, Contractor Safety, DOT, Process Safety, Environmental
   - P2 high-risk work, on a shared Permit-to-Work engine: Confined Space, Hot Work, Heights, Electrical
   - P2 equipment: Fleet, Forklifts, Cranes & Rigging, Machine Safety, Chemical Safety
   - P3: Analytics, Messaging, Import Center, Warehouse, Manufacturing

   Each slice ports from the 1.0 source under `legacy/forge-platform` (services in `apps/platform-api/src/modules/industrial*`, schema in `packages/database`, UI in `apps/industrial-web`), and ships with its own 2.0 migration, DB tests, Playwright smoke and a `PORT_Sn_*.md` doc.
4. **Data migration.** Per tenant: copy each module's 1.0 records into 2.0 tables, check counts and spot-check them, then switch that tenant's module to 2.0.
5. **Non-industrial products.** RMS, portals and academy, according to the open questions above.
6. **Retire legacy.** Once no tenant uses a 1.0 module, delete `legacy/forge-platform` and archive the Forge-Platform repository.

## Done means

A module is done when it reaches PARITY or better in the matrix, its tenants' data is migrated, and the 1.0 route for it redirects to 2.0.
