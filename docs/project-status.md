# Forge Platform — Project Status

**Last updated:** 2026-07-31 (DR-1)  
**Source of Truth:** `Master Directive.pdf` (MD-1.0)  
**Phase model:** Master Directive §42  
**Governance:** `docs/program/governance.md`  
**Dashboard:** `docs/program/program-dashboard.md`

## Overall completion

| Metric                                                | Estimate                          |
| ----------------------------------------------------- | --------------------------------- |
| **Overall completion** (toward §48 outcome)           | **~30%**                          |
| **Directive completion** (breadth of §1–§48)          | **~30%**                          |
| **Platform completion** (Phases 0–3 + shared engines) | **~65%**                          |
| **Configuration (Phase 4)**                           | **~55%**                          |
| **Import/Export (Phase 5)**                           | **~45%** (import high; export 0%) |
| **Academy (Phases 6–8)**                              | **~2%**                           |
| **RMS (Phases 9–10)**                                 | **~22%** of full §20              |
| **GovCloud (Phase 12)**                               | **~5%**                           |

## Current phase / next phase

|                                               | §42                                                                                                                                          |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **Current phase (primary execution posture)** | **Phase 5** Import acceptance closure + **Phase 4** limitation tracking; **Phases 9–10** partial under AX-SEQ-01 (no new unauthorized scope) |
| **Next phase (when authorized)**              | Phase 5 Export closeout **or** FX pilot Wave 1 **or** Phase 4 form/workflow — each requires separate authorization                           |
| **Not next without auth**                     | 5A QR, 6–8 Academy, 12 GovCloud, NERIS P5 / AI expansion                                                                                     |

## Directive completion (phase rollup)

| §42 Phase          | Status                                         |
| ------------------ | ---------------------------------------------- |
| 0 Discovery        | COMPLETE                                       |
| 1 Monorepo         | COMPLETE                                       |
| 2 AWS landing zone | PARTIALLY_COMPLETE (AX-AWS-01)                 |
| 3 Shared platform  | PARTIALLY_COMPLETE                             |
| 4 Configuration    | PARTIALLY_COMPLETE (ACCEPTED_WITH_LIMITATIONS) |
| 5 Import & Export  | PARTIALLY_COMPLETE                             |
| 5A QR              | NOT_STARTED                                    |
| 6–8 Academy        | NOT_STARTED                                    |
| 9–10 RMS           | PARTIALLY_COMPLETE                             |
| 11 Hardening       | PARTIALLY_COMPLETE                             |
| 12 GovCloud        | NOT_STARTED                                    |

## Known risks

| Risk                               | Severity   | Notes              |
| ---------------------------------- | ---------- | ------------------ |
| Academy dual-stack (Firebase live) | Critical   | AX-ACA-01; DEC-008 |
| Phase 5 incomplete without Export  | High       | AX-EXP-01          |
| RMS partial vs §20 DoD             | High       | AX-RMS-01          |
| Import S8 not ready for review     | Medium     | AX-IMPORT-01       |
| FX pilot tenant undesignated       | Medium     | Blocks FX-P1       |
| Doc path drift vs §31/§41          | Low–Medium | AX-DOC-01          |

## Blocked work

| Item                                 | Blocker                                   |
| ------------------------------------ | ----------------------------------------- |
| FX pilot Wave 1                      | Pilot tenant UUID not designated          |
| NERIS Phase 5 / AI product expansion | Explicit authorization stop (AX-NERIS-01) |
| Academy AWS build                    | Not authorized; dual-stack policy         |
| QR platform (5A)                     | Not authorized (AX-QR-01)                 |
| Export Center                        | Not authorized (AX-EXP-01)                |
| GovCloud                             | Not authorized                            |
| Firebase deletion                    | Replacements not accepted                 |
| Global FX feature flags              | Hard stop                                 |

## Architecture exceptions

Authoritative register: `docs/program/architecture-exceptions.md`.

Standing highlights: **AX-API-01** (platform-api consolidation), **AX-SEQ-01**
(sequencing), **AX-AWS-01** (staged account), **AX-RMS-01** / **AX-CFG-01**
(partial/conditional), **AX-RDMP-01 RESOLVED** (legacy numbering retired).

## Pilot status (FX)

| Item                | Status                                                    |
| ------------------- | --------------------------------------------------------- |
| FX S0–S2F strangler | Complete (flags default false)                            |
| Pilot pack          | Present under `docs/forge-experience/products/rms/pilot/` |
| Pilot tenant        | **Not designated** — EXTEND PILOT                         |
| GA                  | **NOT READY FOR GA**                                      |
| DR-1 impact         | **Does not** unblock pilot                                |

## Recent accepted / delivered tracks

| Deliverable            | Status                                | Nest under §42  |
| ---------------------- | ------------------------------------- | --------------- |
| Sprints 1A–1E          | COMPLETE                              | Phases 0–3 / 11 |
| Configuration Platform | ACCEPTED_WITH_LIMITATIONS             | Phase 4         |
| Import S1–S6           | ACCEPTED (w/ limitations where noted) | Phase 5         |
| Import S7              | READY_FOR_REVIEW (per summary)        | Phase 5         |
| Import S8              | NOT_READY_FOR_REVIEW                  | Phase 5         |
| NERIS P1–P4            | Delivered; P5 blocked                 | Phases 9–10     |
| FX S2F                 | Presentation strangler complete       | Phases 9–10 UX  |

## Roadmap

Canonical roadmap (§42): `docs/technical-roadmap.md`  
Phase mapping: `docs/program/directive-phase-mapping.md`  
Traceability: `docs/program/directive-traceability-matrix.md`

## Next (governance-safe)

1. Operate under MD-1.0 / §42 only — no legacy 1–17 planning IDs.
2. Close Import acceptance gaps when product owner authorizes review cycles.
3. Designate FX pilot tenant before any Wave 1 enablement.
4. Do not start Academy / QR / Export / GovCloud / NERIS P5 without authorization.

Day-to-day AWS CLI: `aws sso login --profile forge-dev`.
