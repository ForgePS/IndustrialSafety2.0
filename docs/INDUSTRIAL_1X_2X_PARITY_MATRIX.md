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
| Industrial Core | Dashboard | FUNCTIONAL | Tenant-aware dashboard, company hierarchy, permissions, feature entitlements, Creator configuration, notifications and cross-module command center | P0 |
| Analytics | Dashboard | MISSING | Role-aware analytics, trends, leading/lagging indicators, drill-down, scheduled reports, exports and AI summaries | P3 |
| Personnel | People & Training | FUNCTIONAL | Preserve all personnel/profile workflows; add qualification state, assignment intelligence, expirations, document links and cross-module competency checks | P0 |
| Training | People & Training | FUNCTIONAL | Preserve courses/records/certifications/My Training; add assignment automation, recurring requirements, expirations, evidence, competency validation and module-driven training rules | P0 |
| JSAs | People & Training | MISSING | Full JSA/JHA authoring, hazards, controls, risk scoring, crew acknowledgment, approvals, revision history, templates, task/permit links and field execution | P1 |
| Incidents | Incident & Claims | FUNCTIONAL | Complete incident reporting/investigation parity; add linked people/assets, root cause, CAPA, claims/OSHA decision support, notifications, AI assistance and trend links | P0 |
| OSHA Recordkeeping | Incident & Claims | MISSING | OSHA 301/300/300A workflow, case review, privacy cases, classification, days away/restricted tracking, annual certification and exports | P1 |
| Workers' Compensation | Incident & Claims | MISSING | Claim lifecycle, incident linkage, carrier/case data, restrictions, lost time, return-to-work, costs, attachments and sensitive permissions | P1 |
| Inspections | Risk & Prevention | FUNCTIONAL | Preserve templates/checklists/findings; add shared CAPA, risk scoring, recurrence, scheduling, assignment, offline field workflow, evidence and analytics | P0 |
| Forms | Risk & Prevention | FOUNDATION | Convert Creator form infrastructure into a true tenant forms/workflow module with submissions, approvals, routing, versioning, attachments, signatures and reporting | P1 |
| Observations | Risk & Prevention | MISSING | Safe/unsafe observations, hazard capture, anonymous option, risk score, assignment, CAPA generation, trending and field-first submission | P1 |
| Risk Register | Risk & Prevention | MISSING | Hazard/risk register with likelihood/severity matrix, controls, residual risk, owners, review cadence, source links and enterprise roll-up | P1 |
| Scan | Risk & Prevention | FOUNDATION | Preserve 1.0 scan assignments/schedules/audit; unify QR scanning with inspections, equipment, training, LOTO and issue reporting | P1 |
| Corrective Actions | Risk & Prevention | FOUNDATION | First-class shared CAPA service with source traceability, containment, root cause, action plan, owner, due date, verification, effectiveness review, recurrence and escalation | P0 |
| DOT Compliance | Compliance Programs | MISSING | Driver/vehicle compliance, qualification files, expirations, inspections, violations, medical/card tracking where applicable and fleet integration | P2 |
| Contractor Safety | Compliance Programs | MISSING | Contractor companies, workers, onboarding, insurance, qualifications, orientations, permits, incidents, documents, status and performance | P2 |
| Process Safety | Compliance Programs | MISSING | PSM/MOC-centered workflows, action tracking, document links, reviews, approvals and auditability | P2 |
| Environmental Safety | Compliance Programs | MISSING | Waste/environmental records, inspections, events, permit/obligation tracking, corrective actions and reporting | P2 |
| Assets & Equipment | Equipment & Operations | FUNCTIONAL | Preserve assets/equipment; add lifecycle, inspections, maintenance, meters, documents, QR, incidents, CAPA, training prerequisites and status history | P0 |
| Fleet | Equipment & Operations | MISSING | Vehicles, drivers, assignments, inspections, maintenance, mileage, defects, compliance and DOT links | P2 |
| Forklifts | Equipment & Operations | MISSING | PIT inventory, operator authorization, inspections, defects, training/qualification checks, maintenance and incident linkage | P2 |
| Cranes & Rigging | Equipment & Operations | MISSING | Equipment/rigging inventory, inspections, qualifications, lift plans, approvals, defects and high-risk workflow links | P2 |
| Machine Safety | Equipment & Operations | MISSING | Machine registry, guarding assessments, safeguards, inspections, defects, CAPA and LOTO linkage | P2 |
| Electrical Safety | Equipment & Operations / High-Risk Work | MISSING | Electrical safety program, energized work controls, qualifications, PPE, boundaries, permit workflow and LOTO linkage | P2 |
| Lockout / Tagout | High-Risk Work | FUNCTIONAL | Complete procedure/use/review parity; add worker qualification checks, permit links, QR launch, periodic review automation, change control and CAPA integration | P0 |
| Confined Space | High-Risk Work | MISSING | Permit-required space registry, atmospheric testing, attendants/entrants, rescue plan, permit approval, suspension/closure and audit trail | P2 |
| Hot Work | High-Risk Work | MISSING | Hot work permits, fire watch, combustibles controls, gas testing where required, approvals, expiration and post-work fire watch | P2 |
| Working at Heights | High-Risk Work | MISSING | Fall protection permits/plans, equipment checks, rescue considerations, competent-person review and worker qualification checks | P2 |
| Chemical Safety | Facility & Operations Safety | MISSING | Chemical inventory, SDS, HazCom, storage/location, approvals, quantities, labeling, exposure/PPE links and reporting | P2 |
| Warehouse Safety | Facility & Operations Safety | MISSING | Warehouse inspections, housekeeping, rack/storage hazards, dock safety, traffic controls, CAPA and analytics | P3 |
| Manufacturing Safety | Facility & Operations Safety | MISSING | Production-line safety records, machine/process hazards, inspections, CAPA, LOTO, training and trend analytics | P3 |
| Emergency Response | Emergency Management | FOUNDATION | Emergency plans, assignments, drills, alerts, accountability, emergency equipment readiness, after-action reviews and CAPA | P2 |
| Tasks | System Tools | FUNCTIONAL | Shared operational work queue with assignments, comments, deadlines, source links, reminders, dependencies, escalation and CAPA linkage | P0 |
| Messaging | System Tools | MISSING | In-app/email/SMS messaging, announcements, targeted groups, delivery history, templates, preference controls and emergency integration | P3 |
| Document Control | System Tools | MISSING | Controlled documents, policies/procedures, versions, approvals, effective dates, acknowledgments, review cycles and records linkage | P2 |
| QR Links | System Tools | FUNCTIONAL | Preserve managed QR definitions and history; standardize secure record launch, versioning, tenant scoping and analytics | P1 |
| Reporting | System Tools | FOUNDATION | Standard and custom reports, filters, saved views, scheduled delivery, PDF/CSV export, dashboards and audit-safe metrics | P2 |
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
