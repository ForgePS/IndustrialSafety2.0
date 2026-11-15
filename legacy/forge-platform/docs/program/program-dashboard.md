# Program Dashboard

**Program:** Forge Public Safety AWS Platform Rebuild  
**Updated:** 2026-07-31 (DR-1)  
**Source of Truth:** `Master Directive.pdf` (**MD-1.0**)

| Field                         | Value                                                                                                                                     |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **Current Directive Version** | MD-1.0 (effective 2026-07-31)                                                                                                             |
| **Governance Status**         | **ACTIVE** — Master Directive adopted; §42 phase model exclusive                                                                          |
| **Overall Completion**        | **~30%** toward §48 outcome                                                                                                               |
| **Current Phase**             | Phase 5 (Import acceptance) + Phase 4 limitations + partial 9–10 under AX-SEQ-01                                                          |
| **Next Milestone**            | Authorized choice: Import acceptance closure **or** FX pilot tenant designation **or** Phase 4 builder closure — each needs explicit auth |
| **DR-1 Recommendation**       | **READY FOR DR-2**                                                                                                                        |

## Open gaps (P0 / P1 highlights)

| ID                        | Summary                         |
| ------------------------- | ------------------------------- |
| GAP-ACA-01                | Academy not on AWS              |
| GAP-RMS-01                | Full §20 RMS incomplete         |
| GAP-QR-01                 | Phase 5A QR not started         |
| GAP-EXP-01                | Export Center not started       |
| GAP-IMP-01                | Import acceptance incomplete    |
| GAP-CFG-FORM / GAP-CFG-WF | Form/workflow builders          |
| GAP-MIG-01                | Firebase migration not executed |
| GAP-004 (FX)              | Pilot tenant undesignated       |

Full register: `directive-gap-register.md`.

## Open / standing exceptions

| ID                   | Disposition             |
| -------------------- | ----------------------- |
| AX-API-01            | APPROVED EXCEPTION      |
| AX-SEQ-01            | APPROVED EXCEPTION      |
| AX-AWS-01            | APPROVED EXCEPTION      |
| AX-ACA-01            | APPROVED TEMPORARY      |
| AX-RMS-01            | APPROVED PARTIAL SCOPE  |
| AX-CFG-01            | APPROVED CONDITIONAL    |
| AX-QR-01 / AX-EXP-01 | APPROVED DEFERral       |
| AX-FX-01             | APPROVED ADJACENT TRACK |
| AX-NERIS-01          | APPROVED STOP           |
| AX-IMPORT-01         | OPEN                    |
| AX-DOC-01            | TEMPORARY               |
| AX-RDMP-01           | **RESOLVED**            |

Full register: `architecture-exceptions.md`.

## Accepted deliverables (recent)

- Sprints 1A–1E
- Configuration Platform — ACCEPTED_WITH_LIMITATIONS
- Import S1–S6 — ACCEPTED (limitations where noted)
- NERIS P1–P4
- FX S0–S2F strangler (flags default false)
- DR-0 audit + **DR-1 governance adoption**

## Blocked deliverables

| Deliverable               | Blocker                   |
| ------------------------- | ------------------------- |
| FX pilot Wave 1           | Tenant UUID               |
| FX / product GA           | Pilot + acceptance        |
| NERIS P5 / AI expansion   | AX-NERIS-01               |
| Academy AWS / migration   | Authorization + AX-ACA-01 |
| QR 5A / Export            | Authorization             |
| GovCloud Phase 12         | Authorization             |
| Import S8 review complete | NOT_READY_FOR_REVIEW      |

## Architecture risks

- Consolidated API blast radius (AX-API-01) — mitigate via ADR + modular boundaries
- Dual-stack Academy (AX-ACA-01) — critical until Phases 6–8
- Claiming Phase 9–10 complete without MVP definition (AX-RMS-01)
- Phase 5 “complete” without Export (AX-EXP-01)

## Governance health

| Check                                            | Status             |
| ------------------------------------------------ | ------------------ |
| Master Directive SoT published                   | ✓                  |
| §42 numbering exclusive in active roadmap/status | ✓                  |
| Traceability matrix                              | ✓                  |
| Phase mapping                                    | ✓                  |
| Architecture exceptions documented               | ✓                  |
| Change control + decision log                    | ✓                  |
| Legacy 1–17 retired as SoT                       | ✓                  |
| Code/flags/deploy changed in DR-1                | ✗ (correct — none) |

## Quick links

| Doc            | Path                                                                   |
| -------------- | ---------------------------------------------------------------------- |
| Governance     | [governance.md](./governance.md)                                       |
| Version        | [directive-version.md](./directive-version.md)                         |
| Traceability   | [directive-traceability-matrix.md](./directive-traceability-matrix.md) |
| Phase mapping  | [directive-phase-mapping.md](./directive-phase-mapping.md)             |
| Exceptions     | [architecture-exceptions.md](./architecture-exceptions.md)             |
| Change control | [change-control.md](./change-control.md)                               |
| Decisions      | [decision-log.md](./decision-log.md)                                   |
| Superseded     | [superseded-documents.md](./superseded-documents.md)                   |
| Roadmap        | [../technical-roadmap.md](../technical-roadmap.md)                     |
| Status         | [../project-status.md](../project-status.md)                           |
