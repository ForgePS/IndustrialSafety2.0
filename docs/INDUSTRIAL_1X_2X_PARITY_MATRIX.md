# Forge Industrial Safety 1.0 → 2.0 Parity & Advancement Matrix

## Purpose

Forge Industrial Safety 2.0 does not replace 1.0 by merely recreating module names. Industrial Safety 1.0 is the minimum functional baseline. A 2.0 capability is complete only when it:

1. preserves every useful 1.0 capability and workflow,
2. reduces unnecessary clicks and duplicate data entry,
3. works cleanly on field/mobile and desktop,
4. participates in shared permissions, audit, attachments, tasks, notifications and reporting,
5. integrates with related modules instead of creating isolated records,
6. adds automation and Forge AI where useful without removing human review,
7. has migration coverage, regression coverage and production validation.

This document is the release gate for 1.0 → 2.0 parity.

## Source of truth

The 1.0/AWS-era module baseline is taken from the existing Forge Platform implementation:

- `ForgePS/Forge-Platform/packages/contracts/src/industrial.ts`
- `apps/industrial-web/src/lib/navigation.ts`
- `apps/industrial-web/src/lib/ops-modules.ts`
- `apps/industrial-web/src/lib/high-risk-modules.ts`
- `apps/industrial-web/src/lib/compliance-modules.ts`
- `apps/industrial-web/src/lib/coordination-modules.ts`
- `docs/data-migration/INDUSTRIAL-DDL-S1-DOMAIN-MATRIX.md`

The 2.0 implementation state is evaluated against `ForgePS/IndustrialSafety2.0` on the current `forge-creator-2.0` line.

## Status model

Every module and sub-capability moves through the same gate:

- **MISSING** — no usable 2.0 runtime exists.
- **FOUNDATION** — schema, registry, navigation, partial UI, or shared services exist but the workflow is not complete.
- **FUNCTIONAL** — primary 2.0 workflow works, but exact 1.0 parity has not been proven.
- **PARITY** — every required 1.0 capability for the module has been mapped and reproduced.
- **ADVANCED** — 2.0 materially improves the 1.0 workflow through integration, automation, UX, analytics, configurability, or AI.
- **VALIDATED** — permissions, scope, audit, migration, field/mobile, smoke and regression testing have passed.
- **PRODUCTION READY** — validated, migration-safe, supportable, observable, documented, and approved for tenant rollout.

A module must not skip directly from FUNCTIONAL to PRODUCTION READY.

---

## Master module matrix

| 1.0 module | 1.0 group | Current 2.0 state | 2.0 required result | Priority |
| --- | --- | --- | --- | --- |
| Industrial Core | Dashboard | COMPLETE | Port slice 7 (docs/PORT_S7_DASHBOARD.md): 1.0's home dashboard with What Needs Your Attention across every module, quick actions, Tasks Due, Safety Index (6 / 12 months, plus DOT file compliance), Task Scheduler, Incident Trend, Injury History with OSHA recordables and DART, Inspections by Location, the injury body map and My Workspace. Per-user layout (show, order, size, pinned modules) saved in the database. Remaining: calendar events and reminders blocks (2.0 has no calendar or reminders module) | P0 |
| Analytics | Dashboard | FOUNDATION | Slice 7 adds role-aware trends and leading/lagging indicators on the home dashboard (incident trend, injury history, safety index, body map). Still missing: drill-down analytics, scheduled reports, exports and AI summaries | P3 |
| Personnel | People & Training | FUNCTIONAL | Preserve all personnel/profile workflows; add qualification state, assignment intelligence, expirations, document links and cross-module competency checks | P0 |
| Training | People & Training | COMPLETE | Port slices 3 and 6 (docs/PORT_S3_TRAINING_LMS.md, docs/PORT_S6_TRAINING_GAPS.md): LMS, kiosk, groups, matrix, record attachments, records search, personnel history, team activity, assignment/reminder/expiring notices, automatic retraining, question import, quiz QC, overdue report, materials library with folders/topics. Remaining: schedule /api/training/cron, xlsx import, video normalization, study mode, per-assignment QR, certificate templates | P0 |
| JSAs | People & Training | COMPLETE | NX-02H atomic authoring/revision/activation, residual hazard assessment UI, PPE/training requirements, crew acknowledgments, stop-work, templates; Playwright authoring/activate + DB contracts green | P1 |
| Observations | Risk & Prevention | COMPLETE | NX-02H atomic lifecycle, anonymous reporter isolation (Playwright + DB), CAPA/risk links, Forge AI search/analyze | P1 |
| Risk Register | Risk & Prevention | COMPLETE | NX-02H atomic lifecycle (draft/assessment/review/active/closed), matrix versioning immutability, approval/acceptance/reviews, CAPA links; matrix admin + lifecycle Playwright green | P1 |
| Incidents | Incident & Claims | FUNCTIONAL | Complete incident reporting/investigation parity; add linked people/assets, root cause, CAPA, claims/OSHA decision support, notifications, AI assistance and trend links | P0 |
| OSHA Recordkeeping | Incident & Claims | FUNCTIONAL | Port slice 1 (docs/PORT_S1_OSHA_RECORDKEEPING.md) and Batch 1 (docs/PORT_B1_PARITY_FIXES.md): cases from incidents, privacy cases, classification, days away/restricted, Form 300 log, 300A summary, per-establishment CSV, awaiting-decision list and print checks. Remaining (Batch 2): Form 300/301 on the official PDFs and the 300A posting layout | P1 |
| Workers' Compensation | Incident & Claims | FUNCTIONAL | Port slice 2 (docs/PORT_S2_WORKERS_COMP.md) and Batch 1: case lifecycle, incident and OSHA linkage, carriers, work status and restrictions, medical encounters, weekly status emails, forms, archived view, search and relinking. Remaining (Batch 2): printable claim with the incident narrative and employee details | P1 |
| Inspections | Risk & Prevention | FUNCTIONAL | Preserve templates/checklists/findings; add shared CAPA, risk scoring, recurrence, scheduling, assignment, offline field workflow, evidence and analytics | P0 |
| Forms | Risk & Prevention | FUNCTIONAL | Port slice 9 (docs/PORT_S9_FORMS.md): company form library and builder (1.0 field types, text mode, CSV checklist import), immutable published versions, fill / submissions with photos and the Employee # subject link, supervisor and EHS Director signatures with sign links and notices, blank and filled print, 1.0 import. QR-to-form via slice 10 form QRs and linked forms. Remaining: offline field fill, Excel import, submissions CSV and reporting | P1 |
| Scan | Risk & Prevention | FUNCTIONAL | Port slice 10 (docs/PORT_S10_SCAN.md): QR action menu for asset, location and form QRs; access modes; employee-number identification with sessions and rate limits; daily/weekly/monthly inspections from a scan with findings, CAPAs and auto out of service; public issue reports creating CAPAs with photos and notices; out of service / return to service with status history; equipment history; LOTO and linked forms; scan log with action and person; in-app camera scanner. Slice 11 adds vehicle QRs with pre-/post-trip DVIR. Remaining: supply, SDS, JSA, document and training targets; training status on identify; sticker printing and QR replacement. 1.0's scan schedule tables had no code and are not a parity item | P1 |
| Corrective Actions | Risk & Prevention | FUNCTIONAL | Port slice 8 (docs/PORT_S8_CORRECTIVE_ACTIONS.md): inspection findings open CAPAs, public single-use closeout link, incident RCA (5 Whys) with a CAPA per action and print, assigned / due soon / overdue / needs verification notifications, reports with on-time % and CSV. Remaining: effectiveness-review reminders, recurrence, escalation, CAPA status sync back to findings | P0 |
| DOT Compliance | Compliance Programs | COMPLETE | Port slice 5 (docs/PORT_S5_DOT.md): driver qualification files with the 1.0 worksheet and uploads, personnel-synced DOT/company-driver flags, insurance MVR roster with the annual sample, other DOT records, dashboard, compliance report and CSV, per-organization settings. Remaining: digital form links, reports catalog, AI context, scheduled reminders and insurer emails | P2 |
| Contractor Safety | Compliance Programs | FUNCTIONAL | Port slice 15 (docs/PORT_S15_CONTRACTORS.md): companies with approval, sponsor, allowed sites and EMR/TRIR; insurance and safety documents with private files and expiry; workers with orientation and training / certifications; computed cleared-to-work standing; site sign-in that refuses uncleared workers unless a manager overrides with a reason; on-site list and sign-out; settings for required documents and orientation length. 1.0 had only generic titled records. Remaining: expiry reminders, evaluations, permits, incident/CAPA links, contractor self-service, roll-call feed | P2 |
| Process Safety | Compliance Programs | FUNCTIONAL | Port slice 16 (docs/PORT_S16_PROCESS_SAFETY.md): management of change with named approvers, rejection with reasons and resubmission, before/after-startup actions tracked as Corrective Actions, linked controlled documents, a pre-startup safety review that gates implementation, temporary changes with revert-by dates, and an append-only history; process hazard analyses with method, team, five-year revalidation and recommendations as Corrective Actions. 1.0 had only generic titled records. Remaining: reminders, PHA worksheets, other PSM elements (PSI, MI, audits), incident/JSA links, templates | P2 |
| Environmental Safety | Compliance Programs | FUNCTIONAL | Port slice 17 (docs/PORT_S17_ENVIRONMENTAL.md): permits with expiry tracking and linked controlled documents; recurring obligations (monitoring, reports, inspections) with completion logs that advance the due date; numbered spill/release, exceedance, complaint and NOV events with agency notice, corrective actions tracked as Corrective Actions, and close gated on both; hazardous waste manifests with LQG/SQG exception report windows; an overview of what needs attention and an events report. 1.0 had only generic titled records. Remaining: reminders, monitoring data against limits, emissions/waste totals, inspection checklists, attachments, incident links | P2 |
| Assets & Equipment | Equipment & Operations | FUNCTIONAL | Preserve assets/equipment; add lifecycle, inspections, maintenance, meters, documents, QR, incidents, CAPA, training prerequisites and status history | P0 |
| Fleet | Equipment & Operations | FUNCTIONAL | Port slice 11 (docs/PORT_S11_FLEET.md): vehicles with every 1.0 field, driver assignment and meter history, out of service / disposal with status history, documents, renewals, 1.0 CSV import, inventory reports; DVIRs (54-item checklist, defects take the unit out of service and open a repair, mechanic certification, signed next-driver review, print, scan DVIR from a vehicle QR); recurring maintenance; Drivers tab from DOT; reminders cron; vehicle QR scan menu. Remaining: fuel, custom report builder, scheduling the cron, cost totals | P2 |
| Forklifts | Equipment & Operations | FUNCTIONAL | Port slice 19 (docs/PORT_S19_FORKLIFTS.md): trucks as assets with an OSHA 1910.178 profile (class I–VII, type, power, capacity, attachments and nameplate check, UL designation), existing equipment can become a forklift; pre-shift checks with built-in and company items by power source, every item answered, an authorized operator for the truck's class, hour meter; defects, with critical ones taking the truck out of service and keeping it there by any route until closed, repairs recorded as maintenance; operator training, evaluation and authorization per class with a 3-year (configurable) expiry, required course, refresher after incidents or unsafe operation, suspend / reinstate / revoke, wallet card; incident links; personnel card, dashboard item and expiry reminders cron. 1.0 had only generic titled records. Remaining: schedule the cron, QR pre-shift check for employees, overdue-check reminders, fuel / charging logs | P2 |
| Cranes & Rigging | Equipment & Operations | MISSING | Equipment/rigging inventory, inspections, qualifications, lift plans, approvals, defects and high-risk workflow links | P2 |
| Machine Safety | Equipment & Operations | MISSING | Machine registry, guarding assessments, safeguards, inspections, defects, CAPA and LOTO linkage | P2 |
| Electrical Safety | Equipment & Operations / High-Risk Work | FUNCTIONAL | Port slice 18 (docs/PORT_S18_PERMITS.md): energized electrical work permits on the shared Permit-to-Work engine, with NFPA 70E justification, shock and arc flash boundaries, incident energy or PPE category, qualified persons, checklist, training checks, approval and issue, and LOTO procedure links. Remaining: wider electrical safety program (equipment labels, arc flash studies), permission per permit type | P2 |
| Lockout / Tagout | High-Risk Work | COMPLETE | Port slice 4 (docs/PORT_S4_LOTO.md): photos with arrows, 1.0 content, return for correction, group lockouts with verify/return-to-service, training-enforced lock holders, print sheet with QR, public QR view, CAPA link. Remaining: reports, AI lockout context, sanitation links, Brady labels, scheduled review reminders, permit links | P0 |
| Confined Space | High-Risk Work | FUNCTIONAL | Port slice 18 (docs/PORT_S18_PERMITS.md): permit-required space register, entry permits with entry supervisor / attendant / entrants, rescue service, checklist, gas tests against company limits (a failing test suspends), entry sign-in/out log, training checks, approval, issue, suspension and closure, print and history. Remaining: schedule the cron, field/mobile flow and signatures, contractor training checks | P2 |
| Hot Work | High-Risk Work | FUNCTIONAL | Port slice 18 (docs/PORT_S18_PERMITS.md): hot work permits with the 35 ft rule checklist, optional gas test, operator and fire watch, approval, issue and expiry, and a fire watch after the work (60 minutes by default) that blocks closing until it ends. Remaining: schedule the cron, simultaneous-operations warnings | P2 |
| Working at Heights | High-Risk Work | FUNCTIONAL | Port slice 18 (docs/PORT_S18_PERMITS.md): fall protection permits with working height, methods, anchorage, rescue plan, equipment inspection checklist, competent person and training checks. Remaining: equipment inspection records per harness/lanyard | P2 |
| Chemical Safety | Facility & Operations Safety | MISSING | Chemical inventory, SDS, HazCom, storage/location, approvals, quantities, labeling, exposure/PPE links and reporting | P2 |
| Warehouse Safety | Facility & Operations Safety | MISSING | Warehouse inspections, housekeeping, rack/storage hazards, dock safety, traffic controls, CAPA and analytics | P3 |
| Manufacturing Safety | Facility & Operations Safety | MISSING | Production-line safety records, machine/process hazards, inspections, CAPA, LOTO, training and trend analytics | P3 |
| Emergency Response | Emergency Management | FUNCTIONAL | Port slice 14 (docs/PORT_S14_EMERGENCY.md): action plans, scenario procedures, drills with after-action reviews, response teams with members, review dates; emergency alerts (live and drill) to the company or chosen locations / departments / people with an audience check and confirmation, templates, in-app + email delivery, updates and all-clear to the same people, "I'm safe / I need help" responses with a roll call; location-scoped senders limited to their locations. Remaining: SMS and consent, CAP / signage feed, saved audience groups, emergency equipment readiness, CAPA from drills | P2 |
| Tasks | System Tools | FUNCTIONAL | Shared operational work queue with assignments, comments, deadlines, source links, reminders, dependencies, escalation and CAPA linkage | P0 |
| Messaging | System Tools | MISSING | In-app/email/SMS messaging, announcements, targeted groups, delivery history, templates, preference controls and emergency integration | P3 |
| Document Control | System Tools | FUNCTIONAL | Port slice 12 (docs/PORT_S12_DOCUMENTS.md): folders, controlled documents with numbered file versions, submit / approve / send back with reasons (no self-approval, one version in review), effective dates, distribution by location / department / role, read-and-acknowledge of the current version for the people it is for, acknowledgment progress and CSV, periodic reviews with confirm review, obsolete / archive, notices, review reminders cron and a dashboard count. Remaining: schedule the cron, links from other records, acknowledgment reminders | P2 |
| QR Links | System Tools | FUNCTIONAL | Managed QR definitions and scan history preserved; slice 10 adds location and form targets, the scan menu, access modes, per-QR action setup, a scan log with action / person / result and a 30-day summary. Remaining: versioning, token replacement, sticker printing | P1 |
| Reporting | System Tools | FUNCTIONAL | Port slice 13 (docs/PORT_S13_REPORTING.md): library of 12 reports across incidents, OSHA 300, workers' comp, inspections, CAPA, personnel, LOTO, assets, DOT and tasks, each with its module's permission and scope; date presets, location / status filters, column choice, group-by with totals; CSV and PDF; saved and shared reports run with the viewer's permissions; daily / weekly / monthly schedules in a time zone to company members (notice + email link); run history. Remaining: schedule the cron, XLSX, sanitation / supplies / training / JSA / observations / fleet reports | P2 |
| Import Center | System Tools | MISSING | Validated imports with mapping, previews, error handling, resumability, duplicate handling, history and rollback evidence | P3 |

---

## Known 2.0 additions beyond strict 1.0 parity

These are product requirements that should be delivered after or alongside parity, but they are not substitutes for missing 1.0 functions:

| 2.0 addition | Target |
| --- | --- |
| Food Safety | Specialty program using shared forms, inspections, CAPA, training, documents and reporting |
| Grain Facilities Sanitation | Specialty program with sanitation schedules, inspections, findings, CAPA, documents and verification |
| Permit-to-Work engine | Shared workflow engine underpinning Confined Space, Hot Work, Heights, Electrical and future permit types |
| Universal Workflow Engine | Shared state transitions, approvals, returns, verification, closeout, escalation and history |
| Forge AI workflow assistance | Drafting, completeness checks, source-grounded Q&A, trend detection and proposed actions requiring user approval |
| Customer Support | Product support/ticketing for Forge customers; not a replacement for an EHS module |
| Creator 2.0 | Tenant configuration/control plane for forms, lookups, navigation, features, roles and experience |

---

## Mandatory shared 2.0 services

2.0 should not recreate these inside every module. They are platform services consumed by modules:

- Tenant / Division / Location context
- Personnel identity and assignments
- Role and scope permissions
- Feature entitlements
- Creator-controlled forms and lookups
- Universal workflow/state engine
- Corrective Actions / CAPA
- Tasks
- Attachments
- Comments
- Activity history
- Immutable audit logging
- Approvals
- Electronic acknowledgments/signatures
- Notifications
- Email/SMS dispatch
- Calendar/reminders
- QR/scan services
- Document control
- Training/qualification checks
- Reporting/analytics
- Forge AI context and approved-action framework

---

## Workflow advancement requirements

### 1. Source-to-CAPA chain

Any qualifying record should be able to create or link a CAPA without duplicate entry:

`Incident / Inspection / Observation / JSA / Audit / Equipment / LOTO / Permit / Risk → CAPA → Task(s) → Verification → Effectiveness Review → Closure`

The source record must retain the relationship and surface current CAPA status.

### 2. Qualification-aware work

When work requires training or qualification, 2.0 should verify the person before assignment or execution:

`Work assignment → employee → required qualification → current training/certification → allow / warn / block based on tenant policy`

### 3. Asset-centered history

Every applicable asset should expose one linked history:

`Asset → QR → inspections → maintenance → defects → incidents → LOTO → CAPA → documents → training requirements → status history`

### 4. Permit-to-Work engine

High-risk modules should share a permit engine rather than duplicate workflow logic:

`Draft → Pre-check → Review → Approved → Active → Suspended (optional) → Completed → Closed`

Permit types can add domain-specific sections and controls.

### 5. One-time data entry

Data already known to Forge should prefill downstream records. Location, Division, Personnel, Asset, incident references and source metadata should not be repeatedly re-entered.

---

## Definition of module parity

A module cannot be marked **PARITY** until its module-level checklist contains all of the following:

- 1.0 routes/pages inventoried
- 1.0 create/read/update/archive/delete behavior mapped
- 1.0 status transitions mapped
- fields and lookups mapped
- permissions mapped
- tenant/location/user scope behavior mapped
- attachments/documents mapped
- comments/history/audit mapped
- notifications/reminders mapped
- reports/exports mapped
- QR/scan behavior mapped where applicable
- mobile/field workflow mapped
- migration source collections mapped
- 2.0 differences documented
- regression tests added
- smoke tests added
- tenant isolation tested
- historical records preserved
- zero silent data loss

## Definition of ADVANCED

After parity, a module must add measurable 2.0 improvements. At least the applicable items below must be implemented:

- fewer workflow steps than 1.0
- automatic prefill
- cross-module links
- automation/routing
- escalation
- configurable tenant behavior
- field/mobile optimization
- offline-safe behavior where required
- contextual Forge AI
- improved dashboards/analytics
- stronger validation
- stronger audit/evidence
- reusable shared services instead of module-local duplication

---

## Build order

### Wave 0 — Parity harness and shared architecture
1. Maintain this master matrix.
2. Create per-module parity checklists.
3. Finish shared workflow engine.
4. Build first-class CAPA.
5. Standardize attachments/comments/activity/audit/notifications.
6. Establish common module smoke-test pattern.

### Wave 1 — Risk & Prevention backbone
1. Corrective Actions / CAPA
2. Forms runtime/submissions
3. JSAs / JHAs
4. Observations
5. Risk Register
6. Scan workflow parity
7. Inspection → CAPA integration

### Wave 2 — Incident & Claims
1. OSHA Recordkeeping
2. Workers' Compensation
3. Incident → OSHA / Workers' Comp / CAPA linkage
4. return-to-work / restriction workflow

### Wave 3 — High-Risk Work
1. Permit-to-Work engine
2. Confined Space
3. Hot Work
4. Working at Heights
5. Electrical / Energized Work
6. Cranes & Rigging / Lift Plans
7. Machine Safety integration
8. LOTO integration

### Wave 4 — Equipment & Transportation Compliance
1. Fleet
2. DOT
3. Forklifts
4. equipment qualification/inspection integrations

### Wave 5 — Enterprise Compliance
1. Chemical Safety / SDS / HazCom
2. Contractor Safety
3. Process Safety
4. Environmental Safety
5. Warehouse Safety
6. Manufacturing Safety

### Wave 6 — Enterprise Tools
1. Document Control
2. Emergency Response
3. Messaging / Notifications
4. Reporting / Analytics
5. Import Center
6. Calendar / Reminders integration

### Wave 7 — Specialty Programs
1. Food Safety
2. Grain Facilities Sanitation
3. future industry-specific modules using the shared platform services

---

## Immediate next build

**Corrective Actions / CAPA is the next P0 module.**

The current 2.0 implementation has:
- inspection findings with basic corrective-action text/status,
- Tasks with a `corrective_action` flag and source linkage,
- audit infrastructure,
- permission/scope infrastructure,
- Creator forms/lookups,
- Forge AI action/context infrastructure.

The next implementation should turn these pieces into a single shared CAPA domain rather than leaving corrective actions embedded inside individual modules.

Minimum first CAPA release:

- CAPA number
- title / description
- corrective vs preventive vs containment type
- source module / source record / source reference
- Location / Division
- severity / risk
- immediate containment
- root cause
- action plan
- assigned owner
- due date
- status
- linked operational Task
- completion evidence
- verifier
- verification result
- verification notes
- effectiveness review
- closure
- comments/activity
- immutable audit
- scope-aware permissions
- inspection finding linkage
- incident linkage hook
- Creator-configurable lookups/forms
- list/dashboard overdue indicators
- smoke/regression tests

---

## Release rule

**Industrial Safety 1.0 remains the minimum functional specification until every required row reaches PARITY and the production migration path is validated.**

2.0 may change the UI, data model and implementation completely. It may not silently remove a useful 1.0 capability.

The desired end state is:

**1.0 capability parity + streamlined workflows + shared services + automation + cross-module intelligence + enterprise controls = Forge Industrial Safety 2.0.**
