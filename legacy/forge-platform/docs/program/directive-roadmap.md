# Directive Roadmap (Reconciliation)

**Audit:** DR-0 (revised)  
**Date:** 2026-07-31  
**SoT:** `Master Directive.pdf` §42  
**Status:** Planning only — no execution authorization beyond existing hard stops

## Immediate (DR-1 — docs / decisions)

1. Adopt Master Directive §42 as sole phase numbering; revise or archive `docs/technical-roadmap.md` 1–17 scheme.
2. Sign ADR for DEV-API-01 (consolidated platform-api) or plan split.
3. Formalize exceptions for NERIS / Import / FX ahead of Academy / QR.
4. Refresh `docs/project-status.md` against this package.
5. Close documentation path gaps (GAP-DM-01, GAP-SEC-DOC, GAP-DOCX-01).

## Near-term product (authorization required per track)

| Order (prefer MD) | Work                              | Gate                                 |
| ----------------- | --------------------------------- | ------------------------------------ |
| Phase 4 closeout  | Form builder + workflow builder   | Config authorization                 |
| Phase 5 closeout  | Export Center + Import acceptance | Platform authorization               |
| Phase 5A          | Shared QR platform (QR-S0+)       | Explicit authorize                   |
| Phases 6–8        | Academy AWS + migration           | Explicit authorize; dual-stack rules |
| Phases 9–10       | Remaining RMS modules             | Scope MVP vs full §20                |
| FX-P1             | Pilot tenant UUID + Wave 1 flags  | Tenant designated                    |
| Phase 11          | Hardening / DR drill / a11y       | Continuous                           |
| Phase 12          | GovCloud                          | After commercial hardening           |

## Hard stops (unchanged)

- No new FX features beyond authorized strangler work
- No global feature-flag enable
- No GA
- No Academy / Industrial / GovCloud build without authorization
- No Firebase deletion until AWS replacements accepted
- No NERIS Phase 5 / AI product expansion without authorization

## Success criteria for “reconciled”

- [ ] One phase SoT in active docs
- [ ] All P0 deviations approved or remediated
- [ ] Gap register owners assigned
- [ ] project-status reflects MD phases
- [ ] Next build track explicitly mapped to a §42 phase

## Recommendation

**MAJOR RECONCILIATION REQUIRED** — proceed to **DR-1** (decision + roadmap rewrite). Do not treat DR-0 as execution approval for new product phases.
