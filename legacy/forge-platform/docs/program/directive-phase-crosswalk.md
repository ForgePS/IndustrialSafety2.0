# Master Directive ↔ Technical Roadmap Crosswalk

**Audit:** DR-0 (short index)  
**Superseded for full mapping by:** [directive-phase-mapping.md](./directive-phase-mapping.md) (DR-1)  
**Date:** 2026-07-31  
**Purpose:** Resolve numbering conflict between `Master Directive.pdf` §42 and legacy `docs/technical-roadmap.md` Phases 1–17.

**DR-1 note:** Legacy 1–17 numbering is **no longer governing**. Active roadmap uses §42 only.

| Master Directive §42 | Intent                        | technical-roadmap.md (legacy)       | Notes                                                                |
| -------------------- | ----------------------------- | ----------------------------------- | -------------------------------------------------------------------- |
| Phase 0              | Discovery                     | Sprint 1A / (none numbered)         | Discovery complete-ish                                               |
| Phase 1              | Monorepo & developer platform | (part of Phase 1 Infra / Sprint 1B) | Complete                                                             |
| Phase 2              | AWS landing zone              | Phase 1 Infrastructure              | Complete (staged single-account)                                     |
| Phase 3              | Shared platform services      | Phases 2–7 roughly                  | Partial (docs/notifications engines thin)                            |
| Phase 4              | Configuration platform        | Phase 8 Configuration Studio        | Partial (accepted w/ limitations; form/workflow builders incomplete) |
| Phase 5              | Import **and export**         | Phase 12 Import Engine              | Import strong; Export missing                                        |
| Phase 5A             | Shared QR platform            | _(not in technical-roadmap)_        | **NOT_STARTED** — major undocumented gap in roadmap                  |
| Phase 6              | Academy core                  | Phase 13 Academy (partial)          | NOT_STARTED                                                          |
| Phase 7              | Academy advanced              | Phase 13                            | NOT_STARTED                                                          |
| Phase 8              | Academy migration             | _(migration section)_               | NOT_STARTED                                                          |
| Phase 9              | RMS core                      | Phase 14 RMS                        | Partial (personnel/training/etc. largely absent; NERIS/CAD exist)    |
| Phase 10             | RMS operations                | Phase 14                            | Partial (prevention/fleet absent; incidents NERIS subset)            |
| Phase 11             | Hardening                     | _(spread)_                          | Partial                                                              |
| Phase 12             | GovCloud readiness            | Phase 17 GovCloud                   | NOT_STARTED                                                          |
| —                    | Marketplace                   | Phase 16                            | NOT_STARTED (MD expands via future products)                         |
| —                    | Industrial                    | Phase 15                            | NOT_STARTED (MD: QR first consumer)                                  |
| —                    | Reporting engine              | Phase 11                            | NOT_STARTED (MD §25)                                                 |
| —                    | Document engine               | Phase 9 technical-roadmap           | Overlaps MD §26 / Phase 3 “Documents”                                |

**Rule going forward:** Prefer **Master Directive §42** numbering in program docs. Revise or deprecate the 1–17 technical-roadmap scheme in DR-1.
