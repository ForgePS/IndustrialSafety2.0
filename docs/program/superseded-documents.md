# Superseded Documents Register

**Program:** Forge Public Safety AWS Platform Rebuild  
**Updated:** 2026-07-31 (DR-1)  
**Source of Truth:** `Master Directive.pdf` (MD-1.0)

| Old Name / Scheme                                                                 | Replacement                                           | Reason                               | Retain?                                   | Archive?                                   | Delete?                       |
| --------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------ | ----------------------------------------- | ------------------------------------------ | ----------------------------- |
| `docs/technical-roadmap.md` Phases **1–17 as SoT**                                | MD §42 + rewritten `technical-roadmap.md`             | Dual numbering conflict (AX-RDMP-01) | Yes — file rewritten; history in appendix | Historical 1–17 section = archive-in-place | No                            |
| DR-0 use of technical-roadmap as directive proxy                                  | `Master Directive.pdf` + `docs/program/governance.md` | Master Directive located             | Yes — DR-0 audit retained                 | No                                         | No                            |
| Informal dual phase citations (“roadmap Phase 8” vs “MD Phase 4”) without mapping | `directive-phase-mapping.md`                          | Ambiguity                            | N/A                                       | N/A                                        | Stop using unmapped citations |
| `docs/program/directive-deviation-register.md` as live dispositions               | `architecture-exceptions.md`                          | DR-1 authoritative dispositions      | Yes — historical audit                    | Soft-archive (header note)                 | No                            |
| `docs/program/directive-phase-crosswalk.md` as only mapping                       | `directive-phase-mapping.md` (expanded)               | DR-1 requires full traceability      | Yes — keep as short index                 | Optional                                   | No                            |
| Pre–DR-1 `docs/project-status.md` (legacy phase table)                            | Rewritten `project-status.md` (DR-1)                  | Obsolete phase refs                  | History via git                           | No                                         | No                            |
| Claims of “Phases 1–8 COMPLETE” under legacy numbering as MD completion           | §42 phase status in program dashboard                 | Misleading vs Master Directive       | N/A                                       | N/A                                        | Stop claiming                 |
| Any Cursor directive implying higher precedence than Master Directive             | Hierarchy in `governance.md`                          | SoT rule                             | N/A                                       | N/A                                        | No                            |

## Documents explicitly NOT superseded

| Document                            | Role                               |
| ----------------------------------- | ---------------------------------- |
| `Master Directive.pdf`              | SoT                                |
| Acceptance / sprint summaries       | Evidence (Rank 3)                  |
| ADRs under `docs/architecture/adr/` | Architecture decisions (Rank 2)    |
| NERIS / Import / FX track docs      | Nested product evidence            |
| `docs/program/*` DR-0 audit set     | Historical reconciliation evidence |

## Retention policy

- Prefer **retain + mark superseded** over delete.
- Delete only with Program Owner approval and no audit value.
- Git history is the archive of record for rewritten files.
