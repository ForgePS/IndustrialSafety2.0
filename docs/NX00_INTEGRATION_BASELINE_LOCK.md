# NX-00 — Integration Baseline Lock

**Status:** LOCKED  
**Baseline branch:** `forge-creator-2.0`  
**Baseline commit:** `520922361c2e20a7db9d0c38d3cc8d1dec339cd9`  
**Locked at:** 2026-09-25  

## Accepted integrations

| Item | PR | Result |
| --- | --- | --- |
| Customer Support | #4 | Already merged before NX-00 |
| Corrective Actions / CAPA | #6 | Merged earlier; retained in baseline |
| Industrial 1.0 → 2.0 parity matrix | #5 | Merged (`docs/INDUSTRIAL_1X_2X_PARITY_MATRIX.md`) |
| Incident ↔ Equipment links | #3 | Rebased, migration renumbered to `20260924320000`, merged |

## Gate results (local)

| Gate | Result |
| --- | --- |
| Migration chain + seed (`supabase db reset`) | Pass |
| Duplicate migration timestamps | None |
| Duplicate permission keys | None |
| Duplicate feature registry keys | None |
| AI schema regression (`scripts/check-forge-ai-schemas.cjs`) | Pass (17 tools) |
| TypeScript (`tsc --noEmit`) | Pass |
| Production build | Pass |
| Customer Support Playwright smoke | Pass |
| CAPA Playwright smoke | Pass |
| Incident equipment Playwright smoke | Pass |
| Cross-tenant denial (Support / CAPA / Incident+Asset) | Pass (404) |

## Required baseline modules present

Tenant context, Creator, Personnel, Training, My Training, Incidents, Inspections, Assets/Equipment, QR, LOTO, Tasks, Forge AI, Customer Support, CAPA, Incident ↔ Equipment links.

## Explicitly not started

**NX-01 and later sprints must not begin until this baseline remains green on `forge-creator-2.0`.**

No new next-level feature work was introduced in NX-00 beyond reconciling and validating the accepted PRs above.
