# Forge Platform Technical Roadmap

**Source of Truth:** `Master Directive.pdf` (MD-1.0)  
**Phase model:** Master Directive **§42** only  
**Updated:** 2026-07-31 (DR-1 — governance adoption)  
**Governance:** `docs/program/governance.md`

This roadmap retains technical detail for each capability area while aligning
**every governing phase** to Directive §42. Legacy Phases 1–17 are **not**
governing; see [Historical appendix](#historical-appendix--legacy-phases-117).

Exceptions that reorder or narrow scope are recorded in
`docs/program/architecture-exceptions.md`.

| §42 Phase | Capability                         | Status                                                   | Est. overall |
| --------- | ---------------------------------- | -------------------------------------------------------- | ------------ |
| 0         | Discovery                          | COMPLETE (freshness review due)                          | ~95%         |
| 1         | Monorepo & developer platform      | COMPLETE                                                 | ~95%         |
| 2         | AWS landing zone                   | PARTIALLY_COMPLETE (staged account — AX-AWS-01)          | ~85%         |
| 3         | Shared platform services           | PARTIALLY_COMPLETE                                       | ~70%         |
| 4         | Configuration platform             | PARTIALLY_COMPLETE (ACCEPTED_WITH_LIMITATIONS)           | ~55%         |
| 5         | Import **and** Export Center       | PARTIALLY_COMPLETE (Import advanced; Export NOT_STARTED) | ~45%         |
| 5A        | Shared QR platform                 | NOT_STARTED                                              | ~0%          |
| 6         | Academy core                       | NOT_STARTED (scaffold only)                              | ~5%          |
| 7         | Academy advanced                   | NOT_STARTED                                              | ~0%          |
| 8         | Academy migration (Firebase → AWS) | NOT_STARTED                                              | ~0%          |
| 9         | RMS core                           | PARTIALLY_COMPLETE (NERIS/CAD/FX slice — AX-RMS-01)      | ~25%         |
| 10        | RMS operations                     | PARTIALLY_COMPLETE                                       | ~20%         |
| 11        | Hardening                          | PARTIALLY_COMPLETE                                       | ~40%         |
| 12        | GovCloud readiness                 | NOT_STARTED                                              | ~5%          |

**Current governing position:** Foundations through Phase 3 largely delivered;
Phase 4 accepted with limitations; Phase 5 Import in acceptance closure;
Phases 5A–8 not started; Phases 9–10 partial under approved sequencing
exception **AX-SEQ-01**.

**Not authorized by this roadmap alone:** Academy build, QR-S0, Export start,
GovCloud, NERIS Phase 5 / AI expansion, global FX flag enable, Firebase deletion.

---

## Phase definitions (§42)

### Phase 0 — Discovery

Inventory legacy Academy/RMS, preservation matrices, risk registers, and
discovery markdown required by Directive §2.

**Evidence:** `docs/discovery/*`, `docs/sprints/SPRINT-1A-summary.md`.

### Phase 1 — Monorepo & developer platform

pnpm/turbo monorepo, TypeScript, NestJS, Next.js, Vitest/Playwright, shared
packages, developer tooling (Directive §3 tooling).

**Evidence:** `docs/sprints/SPRINT-1B-summary.md`.  
**Exception:** AX-API-01 — consolidated API apps.

### Phase 2 — AWS landing zone

CDK commercial development landing zone: networking, encryption, storage,
database, messaging, compute, observability, backup, deployment identity
(Directive §4).

**Evidence:** `docs/sprints/SPRINT-1C-summary.md`, `infra/`.  
**Exception:** AX-AWS-01 — staged single-account.

### Phase 3 — Shared platform services

Tenant isolation, identity, authorization, person registry, organizations,
tenant management, audit, events/outbox, entitlements/feature flags, and
shared engines foundations (Directive §7–§11, §28–§30). Document and
notification **product engines** remain thin (GAP-DOC-01, GAP-NTF-01).

**Evidence:** `SPRINT-1D-summary.md`, `SPRINT-1E-summary.md`; ADRs 012–019.  
**Modules:** `apps/platform-api`, `apps/worker-service`, shared `packages/*`.

### Phase 4 — Configuration platform

Versioned Configuration Studio: dropdowns, custom fields, forms, workflows,
terminology, navigation, roles (Directive §12–§16).

**Status:** Product delivered; acceptance
`docs/releases/CONFIGURATION_PLATFORM_ACCEPTANCE.md` —
**ACCEPTED_WITH_LIMITATIONS**. Form builder and workflow builder incomplete
vs full DoD (AX-CFG-01).

**Modules:** `packages/configuration`, Creator Console `/studio/*`,
Tenant Admin, RMS runtime consumers.

### Phase 5 — Import and Export Center

Universal Import Center (Directive §17) **and** shared Export Center
(Directive §18).

**Import:** S1–S8 implemented at varying acceptance states; S8 remains
`NOT_READY_FOR_REVIEW` (see import sprint/deployment docs).  
**Export:** NOT_STARTED (AX-EXP-01).

**Modules:** `packages/imports`, `packages/import-center`, API/worker import
paths. Export package not present.

### Phase 5A — Shared QR platform

Shared QR generation, public resolver, access policies (Directive §17A).

**Status:** NOT_STARTED (AX-QR-01). Do not start without authorization.

### Phase 6 — Academy core

Academy domain on AWS shared platform (Directive §19 core).

**Status:** NOT_STARTED beyond `apps/academy-web` scaffold (AX-ACA-01).

### Phase 7 — Academy advanced

Advanced Academy capabilities (Directive §19 advanced).

**Status:** NOT_STARTED.

### Phase 8 — Academy migration

Firebase → AWS cutover pipeline (Directive §38).

**Status:** NOT_STARTED. Firebase deletion forbidden until replacements
accepted (DEC-008).

### Phase 9 — RMS core

Core RMS modules on AWS (Directive §20 core): personnel, training foundations,
configuration integration, incident foundations, etc.

**Status:** PARTIAL — NERIS schema/incident shell, master data, FX
presentation strangler (AX-RMS-01, AX-FX-01, AX-SEQ-01).

**Modules:** `apps/rms-web`, `packages/neris`, FX packages, CAD contracts as
applicable.

### Phase 10 — RMS operations

Operations depth: CAD integrations, NERIS submission path, prevention, fleet,
scheduling, EMS as specified (Directive §20 operations / §20.11).

**Status:** PARTIAL — CAD/NERIS P1–P4; prevention/fleet/scheduling largely
absent. NERIS Phase 5 / AI expansion **blocked** (AX-NERIS-01).

### Phase 11 — Hardening

Security, performance, accessibility, DR drills, observability completeness
(Directive §30–§36, §40, §44).

**Status:** PARTIAL — strong hot-path tests; DR restore proof and production
a11y incomplete.

### Phase 12 — GovCloud readiness

GovCloud org, compatibility register, partition deploy (Directive §4.2, §39).

**Status:** NOT_STARTED (stubs / discovery only).

---

## Nested product tracks (not §42 phase IDs)

| Track                    | Nest under        | Notes                                      |
| ------------------------ | ----------------- | ------------------------------------------ |
| Import S1–S8             | Phase 5           | Acceptance closure required                |
| NERIS P1–P4              | Phases 9–10       | P5 blocked                                 |
| Forge Experience S0–S2F  | Phases 9–10 UX    | Flags default false; pilot tenant required |
| AI Narrative foundation  | Blocked expansion | Flags false; no product expansion          |
| Industrial / Marketplace | After QR / later  | NOT_STARTED                                |

---

## Current recommended next (authorization still required)

1. Keep governance current (DR-1 complete as docs).
2. Import Phase 5 acceptance closure (no unauthorized S9).
3. FX pilot only after tenant designation (not unblocked by DR-1).
4. Phase 4 limitation closure (forms/workflows) when authorized.
5. Do **not** start Academy / QR / Export / GovCloud / NERIS P5 without
   explicit authorization.

Full mapping: `docs/program/directive-phase-mapping.md`.  
Dashboard: `docs/program/program-dashboard.md`.

---

## Historical appendix — legacy Phases 1–17

> **SUPERSEDED as Source of Truth** (DR-1 / AX-RDMP-01 / DEC-005).  
> Retained for audit only. Do not plan new work against these IDs.

| Legacy ID | Capability (historical) | Maps primarily to §42     |
| --------- | ----------------------- | ------------------------- |
| 1         | Infrastructure          | Phase 2                   |
| 2         | Shared Platform         | Phase 3                   |
| 3         | Identity                | Phase 3                   |
| 4         | Person Registry         | Phase 3                   |
| 5         | Organizations           | Phase 3                   |
| 6         | Tenant Management       | Phase 3                   |
| 7         | Authorization           | Phase 3                   |
| 8         | Configuration Studio    | Phase 4                   |
| 9         | Document Engine         | Phase 3 / 11 (GAP-DOC-01) |
| 10        | Notification Engine     | Phase 3 (GAP-NTF-01)      |
| 11        | Reporting Engine        | Phase 11 (GAP-RPT-01)     |
| 12        | Import Engine           | Phase 5 (import half)     |
| 13        | Forge Academy           | Phases 6–8                |
| 14        | Forge RMS               | Phases 9–10               |
| 15        | Forge Industrial        | Post–5A / later           |
| 16        | Marketplace             | Later                     |
| 17        | GovCloud                | Phase 12                  |

Prior narrative detail for legacy phases lived in pre–DR-1 revisions of this
file (see git history).
