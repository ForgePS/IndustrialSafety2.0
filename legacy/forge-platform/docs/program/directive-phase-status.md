# Directive Phase Status

**Audit:** DR-0 (revised)  
**Date:** 2026-07-31  
**Numbering:** Master Directive §42 (authoritative)

| Phase | Name                          | Status                                              | Completion (est.) | Key evidence                                                | Blockers / notes                        |
| ----- | ----------------------------- | --------------------------------------------------- | ----------------- | ----------------------------------------------------------- | --------------------------------------- |
| 0     | Discovery                     | **COMPLETE** (content freshness NEEDS_VERIFICATION) | ~95%              | `docs/discovery/`                                           | Spot-check preservation matrix          |
| 1     | Monorepo & developer platform | **COMPLETE**                                        | ~95%              | Monorepo, pnpm, turbo, CI                                   | Maintain                                |
| 2     | AWS landing zone              | **PARTIALLY_COMPLETE**                              | ~85%              | CDK infra; staged single-account                            | Full org accounts deferred (DEV-AWS-01) |
| 3     | Shared platform services      | **PARTIALLY_COMPLETE**                              | ~70%              | Auth, tenancy, events, attachments; docs/notifications thin | GAP-DOC-01, GAP-NTF-01                  |
| 4     | Configuration platform        | **PARTIALLY_COMPLETE**                              | ~55%              | Config Studio ACCEPTED_WITH_LIMITATIONS                     | GAP-CFG-FORM, GAP-CFG-WF                |
| 5     | Import **and** Export Center  | **PARTIALLY_COMPLETE**                              | ~45%              | Import S1–S8; Export absent                                 | GAP-EXP-01, GAP-IMP-01                  |
| 5A    | Shared QR platform            | **NOT_STARTED**                                     | ~0%               | None                                                        | GAP-QR-01 — authorize QR-S0             |
| 6     | Academy core                  | **NOT_STARTED**                                     | ~5%               | `academy-web` scaffold                                      | GAP-ACA-01                              |
| 7     | Academy advanced              | **NOT_STARTED**                                     | ~0%               | —                                                           | After Phase 6                           |
| 8     | Academy migration             | **NOT_STARTED**                                     | ~0%               | Firebase still SoT for Academy                              | GAP-MIG-01                              |
| 9     | RMS core                      | **PARTIALLY_COMPLETE**                              | ~25% of full §20  | NERIS/CAD/personnel thin                                    | GAP-RMS-01; FX adjacent                 |
| 10    | RMS operations                | **PARTIALLY_COMPLETE**                              | ~20%              | Incidents/NERIS; prevention/fleet absent                    | GAP-CAD-01                              |
| 11    | Hardening                     | **PARTIALLY_COMPLETE**                              | ~40%              | Tests, security docs, monitoring partial                    | GAP-OBS-01, a11y, DR drill              |
| 12    | GovCloud readiness            | **NOT_STARTED**                                     | ~5%               | Discovery stubs                                             | GAP-017                                 |

## Adjacent authorized tracks (not MD phase IDs)

| Track                   | Status                                         | Relation to §42                  |
| ----------------------- | ---------------------------------------------- | -------------------------------- |
| NERIS P1–P4             | Delivered; P5 blocked                          | Accelerates Phase 9–10 incidents |
| Import S1–S8            | Delivered / acceptance pending                 | Phase 5 import half              |
| Forge Experience S0–S2F | Presentation strangler complete; pilot blocked | UX for Phase 9–10 surfaces       |
| FX pilot / GA           | Pilot EXTEND; GA NOT READY                     | Gated — no global flags          |

## Recommendation

**MAJOR RECONCILIATION REQUIRED** until DEV-PHASE-01 / DEV-RDMP-01 / DEV-API-01 are formally decided in DR-1.
