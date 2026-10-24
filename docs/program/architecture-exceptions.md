# Architecture Exception Register

**Program:** Forge Public Safety AWS Platform Rebuild  
**Source of Truth:** `Master Directive.pdf` (MD-1.0)  
**Updated:** 2026-07-31 (DR-1)  
**Rule:** No undocumented deviations. Dispositions are binding until changed via change control.

| Exception ID | Directive Reference                                       | Current Implementation                                                     | Reason                               | Risk                             | Approval Required  | Recommendation                                                  | Disposition                                                   |
| ------------ | --------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------ | -------------------------------- | ------------------ | --------------------------------------------------------------- | ------------------------------------------------------------- |
| AX-API-01    | §3 monorepo multi-`*-api` apps                            | Single `apps/platform-api` + `apps/worker-service` (domain modules inside) | Shared tenancy, auth, ops simplicity | Medium — coupling / blast radius | Architecture Owner | Keep consolidation; author ADR; split only if scale requires    | **APPROVED EXCEPTION** (DEC-003); ADR follow-up               |
| AX-SEQ-01    | §42 phase order (Academy/QR before full RMS acceleration) | Import, NERIS/CAD, FX advanced; Academy/QR not started                     | Prior product authorizations         | High vs strict §42               | Program Owner      | Prefer §42 going forward; exception covers existing tracks only | **APPROVED EXCEPTION** (DEC-004)                              |
| AX-RDMP-01   | One phase numbering model                                 | Legacy technical-roadmap 1–17 coexisted with §42                           | Historical accrual                   | High — planning confusion        | Program Owner      | Rewrite roadmap to §42; archive 1–17 as history                 | **RESOLVED** (DEC-005 / DR-1)                                 |
| AX-QR-01     | §17A / Phase 5A before Academy                            | QR not started; Import/RMS advanced                                        | Not authorized                       | Medium                           | Program Owner      | Formal deferral until QR-S0 authorized                          | **APPROVED DEFERral** (under AX-SEQ-01)                       |
| AX-EXP-01    | §18 Export with Phase 5 Import                            | Import S1–S8 advanced; no exports package                                  | Sequencing                           | Medium                           | Program Owner      | Schedule Export in Phase 5 closeout                             | **APPROVED DEFERral** (under AX-SEQ-01)                       |
| AX-ACA-01    | §19 / Phases 6–8 AWS Academy                              | Firebase live; `academy-web` scaffold only                                 | Migration not ready                  | Critical for §48                 | Program Owner      | Dual-stack until Phases 6–8                                     | **APPROVED TEMPORARY** (DEC-008); expiry = Academy acceptance |
| AX-RMS-01    | §20 full RMS module set                                   | NERIS/CAD/FX/incidents slice; fleet/prevention/scheduling/etc. absent      | Incremental delivery                 | High vs full DoD                 | Product + Program  | Define MVP vs full parity before claiming Phase 9–10 complete   | **APPROVED PARTIAL SCOPE** — completeness claims restricted   |
| AX-CFG-01    | §12–§16 full Configuration DoD                            | ACCEPTED_WITH_LIMITATIONS; form/workflow builders incomplete               | Accepted limitations                 | Medium                           | Product            | Close form/workflow builders under Phase 4                      | **APPROVED CONDITIONAL** — limitations remain open gaps       |
| AX-AWS-01    | §4.1 full commercial org accounts                         | Staged single development account                                          | Directive allows staged              | Low near-term                    | Architecture Owner | Expand when needed                                              | **APPROVED EXCEPTION** (DEC-006)                              |
| AX-DOC-01    | §31 / §39 / §41 exact doc paths                           | Docs exist under alternate names/paths                                     | Organic growth                       | Low–medium                       | Program            | Documentation map sprint                                        | **TEMPORARY** — remediate in docs hygiene                     |
| AX-FX-01     | MD phases do not name FX program                          | FX S0–S2F complete; flags default false; pilot blocked                     | Adjacent UX strangler                | Low if gated                     | Program Owner      | Keep under flags; nest under Phases 9–10 UX                     | **APPROVED ADJACENT TRACK** (DEC-009)                         |
| AX-NERIS-01  | §20.11 NERIS path; AI expansion                           | P1–P4 delivered; Phase 5 / AI expansion blocked                            | Explicit hard stop                   | Low                              | Program Owner      | Hold until authorized                                           | **APPROVED STOP** (DEC-007)                                   |
| AX-IMPORT-01 | Phase 5 Import acceptance completeness                    | S1–S8 delivered at varying acceptance states; S8 `NOT_READY_FOR_REVIEW`    | Ongoing track                        | Medium                           | Product            | Close acceptance gaps before Phase 5 complete claim             | **OPEN** — tracked; not a structural exception                |

## Disposition meanings

| Disposition             | Meaning                                         |
| ----------------------- | ----------------------------------------------- |
| APPROVED EXCEPTION      | Standing allowed deviation                      |
| APPROVED DEFERral       | Allowed delay of required capability            |
| APPROVED TEMPORARY      | Allowed until stated exit condition             |
| APPROVED CONDITIONAL    | Allowed with open limitations                   |
| APPROVED PARTIAL SCOPE  | Partial delivery allowed; do not claim full DoD |
| APPROVED STOP           | Explicit non-start / freeze                     |
| APPROVED ADJACENT TRACK | Parallel program nested under directive phases  |
| RESOLVED                | No longer a deviation                           |
| OPEN                    | Needs closure; not approved as permanent        |
| REJECTED                | Must remediate to directive                     |

## Relationship to DR-0 deviation IDs

| DR-0 ID      | DR-1 Exception        |
| ------------ | --------------------- |
| DEV-API-01   | AX-API-01             |
| DEV-PHASE-01 | AX-SEQ-01             |
| DEV-RDMP-01  | AX-RDMP-01 (RESOLVED) |
| DEV-QR-01    | AX-QR-01              |
| DEV-EXP-01   | AX-EXP-01             |
| DEV-ACA-01   | AX-ACA-01             |
| DEV-RMS-01   | AX-RMS-01             |
| DEV-CFG-01   | AX-CFG-01             |
| DEV-AWS-01   | AX-AWS-01             |
| DEV-DOC-01   | AX-DOC-01             |
| DEV-FX-01    | AX-FX-01              |
| DEV-NERIS-01 | AX-NERIS-01           |

DR-0 `directive-deviation-register.md` is retained as historical audit; **this register is authoritative** for dispositions after DR-1.
