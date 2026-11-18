# MK-S1 Plan — Core Tenant Domain

## Objective

Establish one authoritative Forge tenant domain model covering tenant lifecycle status, tenant settings/branding/domains (existing), facilities/sites, departments (via organizations), and tenant product/module assignments — without renaming production concepts or building parallel v2 tables.

## Current State

- `tenants` table + `TenantsService` support PROVISIONING → ACTIVE/SUSPENDED/ARCHIVED.
- Missing first-class **TRIAL** and **CANCELED** tenant statuses required by SaaS lifecycle.
- `tenant_settings` / `tenant_branding` / `tenant_domains` already exist.
- `tenant_products` / `tenant_module_entitlements` + `EntitlementsService` already exist.
- Facilities are fragmented (Config Studio JSON + RMS `rms_stations`) — BACKLOG-010.
- Departments are not a separate SQL entity; organizations (+ types) are the hierarchy.

## Reuse

- `packages/database` tenants / settings / branding / domains / entitlements
- `apps/platform-api` tenants + entitlements modules
- Organizations as the department hierarchy (`organization_types` + `organizations`)
- `@forge/authorization` operational state evaluation
- RLS via additive migration pattern (`0009_rms_master_data.sql` style)

## Changes Required

1. Canonical `TENANT_STATUSES` + transition rules in `@forge/contracts`.
2. Harden `TenantsService` transitions; add trial + cancel; reject invalid status transitions.
3. Update `evaluateTenantOperationalState` for TRIAL / CANCELED.
4. Add canonical `facilities` table (tenant-scoped) + RLS + ownership assert helper.
5. Add Facilities API module (CRUD minimal: create/list/get) with cross-tenant rejection.
6. Seed `DEPARTMENT` organization type for departments-where-applicable.
7. Document adapter map: RMS stations / Config Studio facilities → platform `facilities` (no forced cutover).
8. Unit tests for required acceptance scenarios.

## Files Expected

```text
docs/forge-saas-foundation/sprints/MK-S1-PLAN.md
docs/forge-saas-foundation/sprints/MK-S1-COMPLETE.md
docs/forge-saas-foundation/TENANCY.md (canonical map)
packages/contracts/src/index.ts (+ tenant-domain helpers/tests)
packages/authorization/src/index.ts (+ tests)
packages/database/src/schema/facilities.ts
packages/database/drizzle/0028_mk_s1_tenant_domain.sql
packages/database/drizzle/meta/_journal.json
packages/database/src/rls.sql.ts
packages/database/src/seed.ts
apps/platform-api/src/modules/tenants/tenants.service.ts (+ tests)
apps/platform-api/src/modules/facilities/*
apps/platform-api/src/modules/entitlements/entitlements.service.test.ts
apps/platform-api/src/app.module.ts
```

## Database Changes

Additive only:

- `facilities` table with `tenant_id`, unique `(tenant_id, facility_key)`, RLS
- Optional `organization_id` FK for facility↔org/department association
- No destructive renames of tenants/orgs/rms_stations

## Security Impact

- Stronger status lifecycle validation (prevent illegal activation)
- Facility ownership must match tenantId (service + RLS)
- No production migration execution in this sprint

## Tests Required

- create / read / update tenant
- invalid tenant status / illegal transition rejected
- facility belongs to tenant allowed
- cross-tenant facility reference rejected
- product assignment
- module assignment
- operational state for TRIAL / CANCELED

## Out of Scope

- Billing UX, invitations UX, Creator Console redesign
- Syncing Config Studio / RMS stations into facilities (adapter deferred)
- MK-S2+ auth/membership/RBAC sprints
- Production migrate/deploy

## Risks

- Existing code may assume only PROVISIONING/ACTIVE/SUSPENDED/ARCHIVED — keep DECOMMISSIONED as inactive alias; dual-compatible.
- Unrelated industrial WIP on branch must not be committed.
