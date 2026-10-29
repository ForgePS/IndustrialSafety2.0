# Current-State Baseline — Forge RMS

**Document:** `01-current-state-baseline.md`  
**Verified against:** `apps/rms-web` source (2026-07-30)  
**Method:** Route filesystem scan, shell nav config, feature-flag constants, permission contracts, e2e suite listing, starter-template modules  
**Status:** COMPLETE for monorepo RMS UI

## Executive summary

Forge RMS in this monorepo is a **NERIS incident + CAD operations** web application. It is **not** yet a full multi-module fire RMS UI. Entitlement catalog modules (Personnel, Training, Apparatus, etc.) exist in platform contracts/templates but **do not have routes in `rms-web` today**.

Legacy Firebase RMS surfaces (prevention, hydrants, fleet, employee portal, etc.) are documented under `docs/discovery/` and are **out of current `rms-web` runtime**. They must not be invented during FX presentation migration without product authorization.

## Application facts

| Fact                | Value                                                                  |
| ------------------- | ---------------------------------------------------------------------- |
| App path            | `apps/rms-web`                                                         |
| Package             | `@forge/rms-web`                                                       |
| Router              | Next.js App Router, `output: "export"`, `trailingSlash: true`          |
| Middleware          | None (`middleware.ts` absent)                                          |
| Auth gating         | Client `RequireAuth` on `/incidents/**`; Cognito via `@forge/web-kit`  |
| Feature gating      | `FeatureGate` + `useFeatureFlags`                                      |
| Design system today | `@forge/design-system` CSS + minimal `@forge/ui` (`EnvironmentBanner`) |
| FX packages         | Zero imports                                                           |
| Local CSS           | `page.module.css`, `shell.module.css`                                  |
| E2E                 | `apps/rms-web-e2e` (Playwright)                                        |

## Inventory counts (verified)

| Category                    | Count     | Notes                                 |
| --------------------------- | --------- | ------------------------------------- |
| App Router pages            | 16        | See `02-route-inventory.md`           |
| Primary nav items (flagged) | 10 + Home | Hardcoded in `app-shell.tsx`          |
| Incident workspace sections | 22        | `INCIDENT_SECTIONS` query `?section=` |
| Local React components      | 14        | Under `src/components/`               |
| Local hooks                 | 2         | autosave, tenant config studio        |
| Feature flags (UI-mapped)   | 12        | `RMS_FEATURE_FLAGS`                   |
| RMS permission strings      | 40+       | `RMS_PERMISSIONS` + CAD + AI spreads  |
| Starter entitlement modules | 9         | Many without UI routes                |
| `@forge/fx-*` consumers     | 0         |                                       |

## Present in production UI

- Auth: login, callback, select-tenant
- Health probe
- Home hub
- Incidents list / new / workspace (22 sections)
- Officer review queue
- NERIS tenant configuration
- CAD: operations, conflicts, messages, connections, unmapped, mappings
- AI narrative assistant panel (flagged)
- Specialty records / review (flagged)
- Attachments gallery

## Not present in `rms-web` (catalog / planned / legacy)

Documented as **gap — not inventoriable as live routes**:

- Personnel / training / scheduling / daily log workspaces
- Fleet V2 vs legacy apparatus UI
- Prevention tree (inspections, occupancies, violations, hydrants, preplans, …)
- Documents module UI
- Reports / analytics module UI
- Employee / department portal product UI (stub apps exist separately)
- Global search / My Work / in-app notification center
- Dedicated executive/operational/personal dashboards (home + CAD ops only)

These areas appear in FX-S2 authorization as future module migration targets and must receive **new baseline docs** when product UI exists or when legacy migration brings them into the monorepo.

## Navigation source of truth

| Source                                                           | Used by shell?                                               |
| ---------------------------------------------------------------- | ------------------------------------------------------------ |
| Hardcoded groups in `app-shell.tsx`                              | **Yes**                                                      |
| Config Studio `navigation` namespace via `useTenantConfigStudio` | **No** (fetched for terminology/roles; not wired to sidebar) |

## Theme / branding

| Item                                   | State                               |
| -------------------------------------- | ----------------------------------- |
| Light / dark / high-contrast FX themes | Not adopted                         |
| Tenant branding tokens                 | Not via FX                          |
| Local theme overrides                  | CSS modules + design-system globals |

## Incomplete / incomplete-functionality notes

| Area                                 | Note                                                   |
| ------------------------------------ | ------------------------------------------------------ |
| Config Studio nav                    | Loaded but unused in shell                             |
| CAD transports                       | Several enum transports `NOT_IMPLEMENTED` in contracts |
| Public registration / student portal | Separate stub apps `NOT_STARTED`                       |
| Prevention officer role permissions  | Exist in contracts; no prevention UI routes            |

## High-risk workflows (live)

1. Incident create → edit → specialty sections → review → approve/return/finalize
2. NERIS configuration manage
3. CAD ingest → conflict resolution → apply/keep Forge
4. Attachment upload/archive with tenant isolation
5. AI narrative rewrite/quality (flags + permissions)
6. Cross-tenant isolation (covered by e2e `isolation.spec.ts`)

## Baseline sign-off (S2A)

This baseline is sufficient to begin **compatibility design** and **S2B planning**. It is **not** a claim that full multi-module RMS exists in `rms-web`.
