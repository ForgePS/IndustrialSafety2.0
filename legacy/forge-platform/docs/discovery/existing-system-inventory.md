# Existing System Inventory

**Sprint:** 1A  
**Date:** 2026-07-25  
**Sources:** `forge-academy-backup`, `forge-rms` (primary), `firebase-app` (supplement)

## 1. Repository map

| Repo           | Path                                           | Package                            | Role                                                |
| -------------- | ---------------------------------------------- | ---------------------------------- | --------------------------------------------------- |
| Forge Academy  | `C:\Users\jerem\Projects\forge-academy-backup` | `forge-academy` `1.0.0-pilot`      | Primary Academy application                         |
| Forge RMS      | `C:\Users\jerem\Projects\forge-rms`            | `forge-public-safety-rms` `0.1.0`  | Primary RMS application                             |
| Firebase App   | `C:\Users\jerem\Projects\firebase-app`         | `horn-lake-fire-ems-rms-dashboard` | Legacy/supplement RMS tree sharing Firebase project |
| Forge Platform | `C:\Users\jerem\Projects\forge-platform`       | (docs-only scaffold)               | Rebuild monorepo home (Sprint 1A docs only)         |

Related but out of Sprint 1A deep inventory: `Forge-Public-Safety` (marketing), `Dept-App`, `main-console`.

## 2. Stack summary

| Product          | Frontend                                           | Backend                                                   | Hosting                                                                |
| ---------------- | -------------------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------- |
| Academy          | React 19, Vite 8, React Router 7, Tailwind 4       | Firebase Auth, Firestore, Storage, Functions v2 (Node 22) | `https://forge-academy-95f84.web.app`                                  |
| RMS (primary)    | React, Vite, SPA module router (not path-heavy RR) | Same Firebase stack                                       | `https://rms.forgepublicsafety.com` (custom domain referenced in code) |
| RMS (supplement) | React/Vite subset                                  | Same Firebase project; older rules/functions              | Same project `rms-dashboard-7562e`                                     |

## 3. Forge Academy — applications and packages

### Apps / packages in repo

- Main SPA (`src/`)
- Cloud Functions (`functions/`)
- Integration Hub Express service (`integration-hub/`) — Academy ↔ RMS sync
- Templates (`templates/forge-dashboard-scaffold/`)
- Scripts (`scripts/`), tests (`tests/`)

### Route inventory (from `src/App.jsx`)

**Public / utility:** `/`, `/login`, `/unauthorized`, `/verify/:validationCode`, `/display/:displayId/:publicKey`, `/board/lesson-plan`

**Creator:** `/admin/creator`, `/admin/creator/preview/:portalId/*` (manual preview subpaths for student/department/instructor/certification/admin portals)

**Admin core:** `/admin`, announcements, messages, events, departments (+ CRUD/roster), students (+ transcript), settings/users, courses, scheduling/classes (+ roster/skills/tests/score-entry), registrations, instructors, certificates (+ templates/print), skills templates, certifications, certification-types, tests, question-banks, reports, invoices (+ layout), digital-dashboard, data-migration, housing (+ rooms/reports), pilot; catch-all `Coming in a future sprint`

**Admin testing:** `/admin/testing/*` — categories, question-banks, blueprints, eligibility, windows, rooms, seats, proctors, accommodations, assignments, monitor, results-hub, grading, results, analytics, exam-review, remediation, retests, certificate-release, reports, state-certification, challenge, audit, lms-integration, rms-integration

**Student:** `/student` + profile, classes, register, transcript, skills, tests, challenge-testing, certifications, housing, certificates, invoices, catalog, events

**Department:** `/department` + roster, bulk-register, approvals, compliance, invoices, housing, events

**Instructor:** `/instructor` + announcements, messages, classes, attendance, schedule, profile, skills (+ evaluate), tests, proctor, closeout, housing

**Certification officer:** `/certification` + messages, pending, renewals, audit, events

### Academy product modules

| Module                                        | Evidence                                        |
| --------------------------------------------- | ----------------------------------------------- |
| Students / identity                           | pages + `students` collection                   |
| Departments / roster                          | department portal + admin departments           |
| Courses / classes / registration / attendance | scheduling + registrations + attendanceDays     |
| Instructors                                   | instructor portal + certifications/availability |
| Certificates / certifications                 | templates, issue, public verify                 |
| Skills / evaluations                          | skill templates + evaluations                   |
| Enterprise testing / LMS                      | large testing module + LMS settings             |
| Housing / dorms                               | rooms, assignments, rosters                     |
| Finance / invoices                            | invoices + PDF/email                            |
| Digital Dashboard / signage                   | extensive DD collections + player               |
| Creator / platform tenancy                    | platformAcademies, subscriptions                |
| Data migration                                | migrationProjects tree                          |
| Integration Hub                               | hub* collections + Express hub                  |

### Integration Hub API surface (`integration-hub`)

Health, departments connect/disconnect, personnel, identity resolve/duplicates/merge, FEMA SID corrections, events, sync/resync, reconcile.

## 4. Forge RMS (primary) — applications and packages

### Apps / packages

- Main SPA (`src/`) — single App shell with module navigation
- Cloud Functions (`functions/`)
- Identity helper functions (`functions-identity/`) — `resolveForgePersonIdentity`
- Recovered platform notes (`_recovered-platform/`)
- Scripts for seed, NERIS, IFC, tenant migration

### Navigation / “routes”

RMS is primarily a **named-module SPA** (nav label → view), not a dense React Router tree. Deep links via `parseAppDeepLink` / gateway routing (`src/lib/gatewayRouting.js`).

**RMS core modules:** Dashboard, Personnel, Certifications, Training, Academy Class Schedule (external URL), Scheduling, Time Sheets, Daily Log

**Fleet:** Fleet Dashboard, Readiness Board, Defects, Work Orders, PM Forecast, Tests, Fuel & Energy, Components & Warranty, Operations, Accident & Risk, Procurement, Cost & Replacement, Reporting & Automation, Vendor Portal, Hardening, All Fleet Assets, Configuration Studio, Apparatus, Assets, Maintenance, Hose Testing

**Prevention** (nested tree `src/data/preventionNav.js`): Overview, Inspections (+ Occupancies, FPS, Offline), Code Enforcement (+ Violations, Notices, Fees, Code Library), Preplans, Hydrants (+ Damage Reports workflows, Water Companies/Districts, Analytics), Configuration Studio, Automation & Hardening

**Reporting:** NERIS Fire Reports, NERIS Analytics

**Documents:** SOGs/Policies, EMS Protocols, Forms, Uploads

**Communications:** Messages, Digital Dashboard

**Platform:** Analytics, Creator Console, System Admin

**Future placeholders:** Incidents, EMS Reports, Compliance Export

### Standalone / special pages

`LoginPage`, `DemoEntryPage`, `AccessDeniedPage`, `GatewayNotFoundPage`, `CreatorConsolePage`, `AdminControlCenterPage`, `EmployeePortalPage`, `UtilityAckPortalPage` (hydrant damage ack), public alert dashboard paths, `HornLakeHydrantApp` / hydrant testing entry.

### Pages directory (`src/pages/`)

~55 page modules covering fleet, inspections, preplans, hydrants, NERIS, personnel, scheduling panels, code library, creator console, etc. Shared/legacy module stubs in `SprintModulePages.jsx`.

## 5. firebase-app (supplement) — delta vs forge-rms

| Aspect           | firebase-app                                    | forge-rms                                                              |
| ---------------- | ----------------------------------------------- | ---------------------------------------------------------------------- |
| Firebase default | `rms-dashboard-7562e`                           | `rms-dashboard-7562e`                                                  |
| Extra alias      | `horn-lake-fire-app`                            | none in `.firebaserc`                                                  |
| UI surface       | Minimal (`HydrantTestingPage` dominant)         | Full multi-module RMS                                                  |
| Firestore rules  | Flat legacy collections; many public read/write | Department-scoped + platform; still some weak public/auth-any patterns |
| Functions        | Academy training webhooks + tenancy helpers     | Full Twilio/Active911/Google/Jotform/Academy/hydrant suite             |
| Storage rules    | Fully open                                      | Fully open (department prefix preferred in code)                       |

**Provenance rule:** Prefer `forge-rms` for product surface; retain `firebase-app` for legacy collection shapes (`hydrants`, `hydrantInspections`, `hydrantFlowTests`, `dailyActivity`, `hoseTests`, `preFirePlans` at root) and older webhook implementations.

## 6. Shared ecosystem links

- Academy hard-codes RMS project `rms-dashboard-7562e` and domain `https://rms.forgepublicsafety.com` (`src/lib/forgeEcosystem.js`).
- RMS links Academy class schedule URL (`src/lib/platformUrls.js`).
- Bidirectional Academy ↔ RMS sync via webhooks, callables, and Integration Hub identity (`forgePersonId`, FEMA SID).

## 7. Components / libraries of note

**Academy:** FullCalendar, pdf-lib, xlsx, Lucide; migration parsers; signage player; certificate rendering.

**RMS:** Leaflet, xlsx, jszip, Lucide; ManagedSelect/dropdowns; fleet + inspections domain libs under `src/lib/fleet`, `src/lib/inspections`.

## 8. Unknowns

- Live document counts / storage object volumes (not queried against production).
- Exact Hosting site ID for RMS custom domain mapping (referenced in code; confirm in Firebase console).
- Whether `firebase-app` still deploys independently or is archive-only.
- Completeness of modeled-but-unimplemented Academy migration connectors (API/DB/SFTP).
