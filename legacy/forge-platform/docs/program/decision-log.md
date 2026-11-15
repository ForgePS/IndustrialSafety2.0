# Program Decision Log

**Program:** Forge Public Safety AWS Platform Rebuild  
**Source of Truth:** `Master Directive.pdf` (MD-1.0)  
**Started:** DR-1 — 2026-07-31

| ID      | Decision                                                                                       | Date       | Reason                                                              | Impact                                                                | Approver                                  | Related Directive Section   |
| ------- | ---------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------- | --------------------------- |
| DEC-001 | Adopt Master Directive as sole governing specification                                         | 2026-07-31 | Eliminate governance drift after DR-0                               | All planning docs subordinate to MD-1.0                               | Program Owner (DR-1)                      | Entire directive; §42       |
| DEC-002 | Adopt §42 phase numbering exclusively                                                          | 2026-07-31 | Dual numbering caused planning conflict                             | `technical-roadmap.md` rewritten; legacy 1–17 archived as history     | Program Owner (DR-1)                      | §42                         |
| DEC-003 | Approve AX-API-01: consolidated `platform-api` + `platform-worker`                             | 2026-07-31 | Operational simplicity; shared tenancy/auth; current delivery model | Multi-`*-api` layout deferred; ADR follow-up required                 | Architecture Owner + Program Owner (DR-1) | §3                          |
| DEC-004 | Approve AX-SEQ-01: product-track sequencing exceptions (NERIS, Import, FX ahead of Academy/QR) | 2026-07-31 | Prior authorized product work; business value                       | Standing exception; future work prefer §42 order unless new exception | Program Owner (DR-1)                      | §42, §17–§20                |
| DEC-005 | Resolve AX-RDMP-01: retire legacy roadmap 1–17 as SoT                                          | 2026-07-31 | One phase model                                                     | Historical appendix retained; §42 governs                             | Program Owner (DR-1)                      | §42                         |
| DEC-006 | Approve AX-AWS-01: staged single-account commercial-dev                                        | 2026-07-31 | Directive allows staged org expansion                               | Full §4.1 org deferred                                                | Architecture Owner (DR-1)                 | §4                          |
| DEC-007 | Affirm AX-NERIS-01: NERIS Phase 5 / AI product expansion remains blocked                       | 2026-07-31 | Explicit prior hard stop                                            | No AI/NERIS P5 without new authorization                              | Program Owner                             | §20.11                      |
| DEC-008 | Affirm Firebase deletion freeze until AWS replacements accepted                                | 2026-07-31 | Dual-stack safety                                                   | Academy remains on Firebase until Phases 6–8 accepted                 | Program Owner                             | §19, §38                    |
| DEC-009 | FX remains flag-gated; no global enable; pilot tenant still required                           | 2026-07-31 | Pilot pack blocker                                                  | FX-P1 not unblocked by DR-1                                           | Program Owner                             | Adjacent FX program; §20 UX |
| DEC-010 | DR-0 package retained as historical audit; DR-1 is governance adoption                         | 2026-07-31 | Audit trail                                                         | DR-0 files remain under `docs/program/`                               | Program Owner                             | Governance                  |

## Pending decisions (not made in DR-1)

| Topic                         | Needed for              | Notes                                              |
| ----------------------------- | ----------------------- | -------------------------------------------------- |
| Formal ADR text for AX-API-01 | Architecture permanence | Exception approved; ADR document still recommended |
| Academy start authorization   | Phase 6                 | Not authorized by DR-1                             |
| QR-S0 authorization           | Phase 5A                | Not authorized by DR-1                             |
| Export Center start           | Phase 5 closeout        | Not authorized by DR-1                             |
| FX pilot tenant UUID          | FX-P1                   | Blocked until designated                           |
| RMS MVP vs full §20 parity    | Phases 9–10             | Scope decision required                            |

## How to add entries

Append a new `DEC-NNN` row. Do not rewrite history. Link related exception IDs and gap IDs in Impact.
