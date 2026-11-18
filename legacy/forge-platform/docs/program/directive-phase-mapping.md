# Directive Phase Mapping (§42 Traceability)

**Program:** Forge Public Safety AWS Platform Rebuild  
**Directive:** `Master Directive.pdf` (MD-1.0) §42  
**Updated:** 2026-07-31 (DR-1)

Legacy technical-roadmap IDs (1–17) appear only under **Historical roadmap ID** and are **not** governing.

---

## Phase 0 — Discovery

| Field                  | Value                                                   |
| ---------------------- | ------------------------------------------------------- |
| MD §42                 | Phase 0 — Discovery                                     |
| Historical roadmap ID  | Sprint 1A (unnumbered)                                  |
| Status                 | COMPLETE (freshness NEEDS_VERIFICATION)                 |
| Acceptance / evidence  | `docs/sprints/SPRINT-1A-summary.md`; `docs/discovery/*` |
| Current sprint / track | None (maintenance)                                      |
| Repository modules     | `docs/discovery/`                                       |
| Future sprint          | Annual freshness review                                 |
| Exceptions             | —                                                       |

## Phase 1 — Monorepo & developer platform

| Field                  | Value                                                |
| ---------------------- | ---------------------------------------------------- |
| MD §42                 | Phase 1                                              |
| Historical roadmap ID  | Part of legacy Phase 1 / Sprint 1B                   |
| Status                 | COMPLETE                                             |
| Acceptance / evidence  | `SPRINT-1B-summary.md`                               |
| Current sprint / track | None                                                 |
| Repository modules     | Monorepo root, `packages/typescript-config`, tooling |
| Future sprint          | Maintain                                             |
| Exceptions             | AX-API-01 (app layout)                               |

## Phase 2 — AWS landing zone

| Field                  | Value                                |
| ---------------------- | ------------------------------------ |
| MD §42                 | Phase 2                              |
| Historical roadmap ID  | Legacy Phase 1 Infrastructure        |
| Status                 | PARTIALLY_COMPLETE (~85%)            |
| Acceptance / evidence  | `SPRINT-1C-summary.md`; `infra/` CDK |
| Current sprint / track | Ops maintenance                      |
| Repository modules     | `infra/`                             |
| Future sprint          | Account expansion when authorized    |
| Exceptions             | AX-AWS-01                            |

## Phase 3 — Shared platform services

| Field                  | Value                                                                                                                |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------- |
| MD §42                 | Phase 3                                                                                                              |
| Historical roadmap ID  | Legacy Phases 2–7 (+ engines 9–10 deferred)                                                                          |
| Status                 | PARTIALLY_COMPLETE (~70%)                                                                                            |
| Acceptance / evidence  | `SPRINT-1D-summary.md`, `SPRINT-1E-summary.md`; ADRs 012–019                                                         |
| Current sprint / track | Hardening / polish only unless authorized                                                                            |
| Repository modules     | `apps/platform-api`, `apps/worker-service`, `packages/{database,auth,authorization,events,audit,tenant-context,...}` |
| Future sprint          | Document + Notification engines (GAP-DOC-01, GAP-NTF-01)                                                             |
| Exceptions             | AX-API-01                                                                                                            |

## Phase 4 — Configuration platform

| Field                  | Value                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------- |
| MD §42                 | Phase 4                                                                                     |
| Historical roadmap ID  | Legacy Phase 8 Configuration Studio                                                         |
| Status                 | PARTIALLY_COMPLETE (~55%); ACCEPTED_WITH_LIMITATIONS                                        |
| Acceptance / evidence  | `docs/releases/CONFIGURATION_PLATFORM_ACCEPTANCE.md`                                        |
| Current sprint / track | Feature-frozen v1.0 except authorized limitation closure                                    |
| Repository modules     | `packages/configuration`, `apps/creator-console`, `apps/tenant-admin`, RMS config consumers |
| Future sprint          | Form builder (GAP-CFG-FORM), Workflow builder (GAP-CFG-WF)                                  |
| Exceptions             | AX-CFG-01                                                                                   |

## Phase 5 — Import and Export Center

| Field                  | Value                                                                             |
| ---------------------- | --------------------------------------------------------------------------------- |
| MD §42                 | Phase 5                                                                           |
| Historical roadmap ID  | Legacy Phase 12 Import Engine (+ Export missing historically)                     |
| Status                 | PARTIALLY_COMPLETE (~45%) — Import advanced; Export NOT_STARTED                   |
| Acceptance / evidence  | `docs/sprints/IMPORT-PLATFORM-S1`…`S8` summaries; S8 `NOT_READY_FOR_REVIEW`       |
| Current sprint / track | Import acceptance closure (no new unauthorized S9)                                |
| Repository modules     | `packages/imports`, `packages/import-center`, platform-api import modules, worker |
| Future sprint          | Export Center (`packages/exports`); Import acceptance closeout                    |
| Exceptions             | AX-EXP-01, AX-IMPORT-01, AX-SEQ-01                                                |

## Phase 5A — Shared QR platform

| Field                  | Value                       |
| ---------------------- | --------------------------- |
| MD §42                 | Phase 5A                    |
| Historical roadmap ID  | _(absent from legacy 1–17)_ |
| Status                 | NOT_STARTED (~0%)           |
| Acceptance / evidence  | None                        |
| Current sprint / track | None — not authorized       |
| Repository modules     | None                        |
| Future sprint          | QR-S0 when authorized       |
| Exceptions             | AX-QR-01, AX-SEQ-01         |

## Phase 6 — Academy core

| Field                  | Value                            |
| ---------------------- | -------------------------------- |
| MD §42                 | Phase 6                          |
| Historical roadmap ID  | Legacy Phase 13 (partial)        |
| Status                 | NOT_STARTED (~5% scaffold)       |
| Acceptance / evidence  | None on AWS                      |
| Current sprint / track | None — not authorized            |
| Repository modules     | `apps/academy-web` (scaffold)    |
| Future sprint          | Academy core after authorization |
| Exceptions             | AX-ACA-01, AX-SEQ-01             |

## Phase 7 — Academy advanced

| Field                  | Value           |
| ---------------------- | --------------- |
| MD §42                 | Phase 7         |
| Historical roadmap ID  | Legacy Phase 13 |
| Status                 | NOT_STARTED     |
| Acceptance / evidence  | None            |
| Current sprint / track | None            |
| Repository modules     | —               |
| Future sprint          | After Phase 6   |
| Exceptions             | AX-ACA-01       |

## Phase 8 — Academy migration

| Field                  | Value                               |
| ---------------------- | ----------------------------------- |
| MD §42                 | Phase 8                             |
| Historical roadmap ID  | Migration notes (unnumbered)        |
| Status                 | NOT_STARTED                         |
| Acceptance / evidence  | Discovery inventory only            |
| Current sprint / track | None                                |
| Repository modules     | `migration/` (thin)                 |
| Future sprint          | Firebase → AWS cutover after parity |
| Exceptions             | AX-ACA-01; DEC-008 freeze           |

## Phase 9 — RMS core

| Field                  | Value                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------ |
| MD §42                 | Phase 9                                                                              |
| Historical roadmap ID  | Legacy Phase 14 RMS                                                                  |
| Status                 | PARTIALLY_COMPLETE (~25% of full §20)                                                |
| Acceptance / evidence  | NERIS P1–P2 summaries; master-data foundations; FX S2F                               |
| Current sprint / track | FX pilot blocked; no new FX features without auth                                    |
| Repository modules     | `apps/rms-web`, `packages/neris`, `packages/web-kit` / fx-*, configuration consumers |
| Future sprint          | Remaining core modules per MVP decision                                              |
| Exceptions             | AX-RMS-01, AX-FX-01, AX-SEQ-01                                                       |

## Phase 10 — RMS operations

| Field                  | Value                                              |
| ---------------------- | -------------------------------------------------- |
| MD §42                 | Phase 10                                           |
| Historical roadmap ID  | Legacy Phase 14 (ops slice)                        |
| Status                 | PARTIALLY_COMPLETE (~20%)                          |
| Acceptance / evidence  | NERIS P3–P4 / CAD docs; incident FX surfaces       |
| Current sprint / track | NERIS P5 blocked (AX-NERIS-01)                     |
| Repository modules     | `packages/cad-*`, rms incidents/CAD routes         |
| Future sprint          | Prevention/fleet/scheduling; close CAD limitations |
| Exceptions             | AX-RMS-01, AX-NERIS-01, AX-SEQ-01                  |

## Phase 11 — Hardening

| Field                  | Value                                                      |
| ---------------------- | ---------------------------------------------------------- |
| MD §42                 | Phase 11                                                   |
| Historical roadmap ID  | Spread across legacy phases + Sprint 1E                    |
| Status                 | PARTIALLY_COMPLETE (~40%)                                  |
| Acceptance / evidence  | Sprint 1E; security docs; test suites; FX a11y conditional |
| Current sprint / track | Continuous                                                 |
| Repository modules     | tests, `docs/security`, monitoring CDK                     |
| Future sprint          | DR drill, a11y production pass, observability dashboards   |
| Exceptions             | —                                                          |

## Phase 12 — GovCloud readiness

| Field                  | Value                                             |
| ---------------------- | ------------------------------------------------- |
| MD §42                 | Phase 12                                          |
| Historical roadmap ID  | Legacy Phase 17 GovCloud                          |
| Status                 | NOT_STARTED (~5% stubs)                           |
| Acceptance / evidence  | Discovery govcloud register                       |
| Current sprint / track | None — not authorized                             |
| Repository modules     | stubs / discovery only                            |
| Future sprint          | GovCloud pack + deploy after commercial hardening |
| Exceptions             | —                                                 |

---

## Adjacent nested tracks (not §42 IDs)

| Track                    | Nests under                  | Status                            | Notes                 |
| ------------------------ | ---------------------------- | --------------------------------- | --------------------- |
| Import S1–S8             | Phase 5                      | In progress / acceptance mixed    | Not program phase IDs |
| NERIS P1–P4              | Phases 9–10                  | Delivered; P5 blocked             | Not program phase IDs |
| Forge Experience S0–S2F  | Phases 9–10 UX               | Strangler complete; pilot blocked | AX-FX-01              |
| AI Narrative foundation  | Deferred / blocked expansion | Flags false; P5 unauthorized      | AX-NERIS-01 related   |
| Industrial / Marketplace | Post–QR / later products     | NOT_STARTED                       | Legacy Phases 15–16   |

## Completeness rule

Every §42 phase row above includes: MD ID → historical ID → evidence → current work → modules → future work. Gaps without modules are explicitly `None` / `—`.
