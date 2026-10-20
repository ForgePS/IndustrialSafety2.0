# Forge Public Safety Portable Demo — Industrial Safety 2.0

Target release: November 4, 2026. This branch is for the **offline customer giveaway** and must not change production behavior.

## Repository audit (October 20)
- Root is a pnpm 9 / Turborepo monorepo, Node 22.
- `apps/web` is Next.js 15; workspace packages include auth, billing, RBAC, and Supabase.
- The root README describes a JetShip starter kit; it does **not** establish that every Industrial Safety module is offline-capable.
- Current Supabase, authentication, billing, and API dependencies require an explicit offline compatibility audit. Do not claim full offline functionality until verified.
- Confirm licensing permits redistribution of the starter kit components before shipping any customer USB.

## Release boundaries
- No real customer data, production credentials, API keys, or service tokens.
- No production email/SMS, billing, telemetry, cloud writes, or network fallbacks.
- Fictional demo tenants only; clearly identify simulated workflows.
- Offline data must persist to a USB-relative directory, with an explicit reset to clean seed data.
- Windows 11 x64 test on a clean machine with no developer tools installed.
- Run a network-denied end-to-end test of every advertised workflow.
- Do not package private server code or proprietary dependencies without a distribution review.

## First implementation milestones
1. Inventory routes, API calls, auth, Supabase queries, and external service dependencies.
2. Define a DEMO_OFFLINE build-time mode and ensure fail-closed network behavior.
3. Create a minimal local data adapter with seeded fictional tenant data; do not silently redirect production adapters.
4. Wire representative major modules and verify create/edit/search/report workflows.
5. Package via signed Windows portable launcher; store user data alongside the drive rather than in ephemeral extraction directories.
6. Add reset/backup, version metadata, startup health checks, and graceful shutdown.
7. Verify no internet access, no admin installation, and no customer/production data leakage.

## Acceptance gates
- [ ] Offline start on clean Windows 11 x64
- [ ] All advertised major modules tested, not merely navigable
- [ ] All CRUD demo actions persist and survive restart
- [ ] Reset restores original fictional data
- [ ] Reports export locally
- [ ] No production/cloud network requests
- [ ] No secrets in distribution artifacts
- [ ] Application signing and AV/SmartScreen tests
- [ ] Third-party redistribution licenses checked
- [ ] Master USB image checksum and duplication test

**Status:** Planning and repository audit initiated. This document is not a completed portable build.
