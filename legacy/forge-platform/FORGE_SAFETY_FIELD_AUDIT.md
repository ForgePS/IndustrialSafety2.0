# Forge Safety - Field Version — Phase 0 Audit

**Application:** Forge Safety - Field Version  
**Scope:** `apps/field-web` (read-only audit)  
**Date:** 2026-09-10  
**Phase:** 0 — documentation only (no application source changes)

---

## Executive verdict

Forge Safety - Field Version is a **Next.js 15 static-export PWA** that authenticates via **Cognito** through `@forge/web-kit` and shares industrial APIs with the broader Forge industrial stack.

**Strong today**

- Auth and app shell
- Bottom navigation
- Home
- My Work
- Scan / QR flows
- LOTO
- Training runner
- Inspections
- Sanitation with offline outbox

**Gaps**

- Tablet shell
- Division / Location context
- Module registry
- Report / Incident
- Corrective detail
- JSA
- Permits
- SDS
- Emergency
- Alerts inbox
- Form engine
- Dexie offline

**Critical:** There is a terminology conflict between the product spec, database columns, and industrial UI cascade. Resolve this before Phase 1.

---

## Repository map

| Path                  | Role                                          |
| --------------------- | --------------------------------------------- |
| `apps/field-web`      | Forge Safety - Field Version (this app)       |
| `apps/industrial-web` | Industrial web UI (shared patterns / cascade) |
| `apps/platform-api`   | Backend APIs                                  |
| `packages/contracts`  | Shared contracts / field permissions          |
| `packages/web-kit`    | Cognito auth and shared web kit               |
| `packages/database`   | Schema / data model                           |
| `infrastructure/cdk`  | AWS CDK                                       |
| `deploy:field-web`    | Field web deploy pipeline / scripts           |

**Tooling:** pnpm **10.12.1** + **turbo**

---

## Stack

| Item          | Value                                        |
| ------------- | -------------------------------------------- |
| Framework     | Next.js **15.3**                             |
| UI            | React **19**                                 |
| Dev port      | **3005**                                     |
| Output        | `output: 'export'` (static export)           |
| Styling       | Custom **`ff-*` CSS** (NOT MUI)              |
| Data fetching | No TanStack Query                            |
| Offline DB    | No Dexie                                     |
| Auth          | Cognito via `@forge/web-kit`                 |
| Tests         | Vitest                                       |
| App deps      | Essentially **contracts** + **web-kit** only |

---

## Branding mismatch

| Source                         | Name                              |
| ------------------------------ | --------------------------------- |
| **Authoritative spec**         | **Forge Safety - Field Version**  |
| Current layout / brand strings | **FORGE FIELD** / **Forge Field** |

Phase 1 should align UI branding **to** the authoritative name: **Forge Safety - Field Version**.

---

## App structure

```
apps/field-web/
  src/
    app/           # App Router routes
    components/    # UI components
    hooks/         # React hooks
    lib/offline/   # Offline / outbox helpers
```

---

## Full route table

| Route                         | Status / notes                                                      |
| ----------------------------- | ------------------------------------------------------------------- |
| `/`                           | Home                                                                |
| `/tasks/`                     | My Work / tasks list                                                |
| `/tasks/item/[id]/`           | Task item detail                                                    |
| `/scan/`                      | Scan entry                                                          |
| `/scan/[token]/`              | Token scan                                                          |
| `/scan/equipment/[token]/`    | Equipment scan                                                      |
| Sanitation scan routes        | Present under sanitation scan flows                                 |
| `/report/`                    | Report entry                                                        |
| `/report/[type]/`             | Stub                                                                |
| `/more/*`                     | More hub — LOTO strong; permits / SDS / emergency stubs; records OK |
| `/training/`                  | Training list                                                       |
| `/training/[assignmentId]/`   | Training runner                                                     |
| `/inspection/[inspectionId]/` | Inspection runner                                                   |
| `/loto/[machineId]/`          | LOTO (strong)                                                       |
| `/equipment/[id]/`            | Partial                                                             |
| `/location/[locationId]/`     | Stub                                                                |
| `/jsa`                        | Stub                                                                |
| `/corrective`                 | Stub                                                                |
| `/incident/new`               | Redirect                                                            |
| `/sanitation/`                | Strong (incl. offline outbox)                                       |
| Auth routes                   | Cognito login / gate flows                                          |

---

## Navigation

|             | Tabs                                    |
| ----------- | --------------------------------------- |
| **Current** | Home \| Tasks \| Scan \| Report \| More |
| **Target**  | Home \| My Work \| Scan \| Alerts \| Me |

**Tablet shell:** Not present (gap).

---

## Auth

- Cognito authentication via `@forge/web-kit`
- Tokens in `localStorage`
- `AuthProvider` + `LoginGate`
- Entitlement: **`FORGE_INDUSTRIAL`**

---

## CRITICAL — Org hierarchy terminology

### Spec model

```
Tenant → Division → Location → Department
```

Example: **Arkansas Ops → Stuttgart**

### Database reality

- `industrial_sites` / `site_id`
- `division_name` (string)
- Departments linked in schema

### Industrial UI (`OrgLocationCascade`)

```
Location (= siteId) → Division → Department
```

### Conflict

Spec language locks **Site → Division** and **Facility → Location**, which **conflicts with section 2** if `site` means plant / facility.

### Recommendation (Phase 0 exit)

1. **Display** “Location” for `site_id`
2. **Display** “Division” for `division_name`
3. **Keep** existing column names in DB / APIs
4. **Creator confirm** terminology before Phase 1 coding

**Do not start Phase 1 until terminology is confirmed.**

---

## API modules and endpoints summary

Industrial field capabilities are served under:

```
/api/v1/industrial/*
```

Notable module areas (as used by Field):

| Module     | Notes                       |
| ---------- | --------------------------- |
| Scan       | QR / token / equipment scan |
| LOTO       | Lockout / tagout            |
| Training   | Assignments / runner        |
| Inspection | Inspection runner           |
| Sanitation | Sanitation + offline outbox |
| My Work    | Tasks / work queue          |

---

## Permissions

- Defined in `packages/contracts` (`field.ts` and related)
- **Gap:** Field does **not** gate features on `activeModules` (module registry gap)

---

## Feature matrix

| Area                        | Status                       |
| --------------------------- | ---------------------------- |
| Auth / shell                | Strong                       |
| Bottom nav                  | Strong (wrong target labels) |
| Home                        | Strong                       |
| My Work / Tasks             | Strong                       |
| Scan / QR                   | Strong                       |
| LOTO                        | Strong                       |
| Training runner             | Strong                       |
| Inspections                 | Strong                       |
| Sanitation + offline outbox | Strong                       |
| Equipment detail            | Partial                      |
| Records (under More)        | OK / Partial                 |
| Report / Incident           | Stub / redirect              |
| Corrective detail           | Stub                         |
| JSA                         | Stub                         |
| Permits                     | Stub                         |
| SDS                         | Stub                         |
| Emergency                   | Stub                         |
| Location context UI         | Stub                         |
| Alerts inbox                | Missing                      |
| Form engine                 | Missing                      |
| Module registry gating      | Missing                      |
| Division / Location context | Missing / conflict           |
| Tablet shell                | Missing                      |
| Dexie offline               | Missing                      |

---

## Reusable vs replace

**Keep / reuse**

- App shell patterns
- Scan flows
- Training / inspection / LOTO runners
- Sanitation offline outbox pattern

**Adapt**

- Industrial `OrgLocationCascade` for Field context (after terminology confirm)

**Do not**

- Mass-delete working Field modules in Phase 1

---

## PWA / offline

| Capability                | Status                     |
| ------------------------- | -------------------------- |
| Manifest + service worker | Present                    |
| `localStorage`            | Used (tokens, light state) |
| Sanitation outbox         | Real offline path          |
| Dexie                     | Not used                   |

---

## Phase 0 exit criteria

- [x] Audit documented (this file)
- [x] Remodel status tracker created
- [x] Changelog started
- [ ] **Terminology confirmation** (blocker for Phase 1)

## Recommend Phase 1

Proceed to Phase 1 **only after** creator confirmation of Location / Division / Site / Facility terminology, then align branding and navigation to the target shell for **Forge Safety - Field Version**.
