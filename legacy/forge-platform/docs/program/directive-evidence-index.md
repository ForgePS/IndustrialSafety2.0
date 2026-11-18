# Directive Evidence Index

**Audit:** DR-0 (revised)  
**Date:** 2026-07-31  
**Authoritative source:** `Master Directive.pdf` (repo root)

| Evidence                             | Path                                                   | Supports         | Notes                                                         |
| ------------------------------------ | ------------------------------------------------------ | ---------------- | ------------------------------------------------------------- |
| Master Directive (SoT)               | `Master Directive.pdf`                                 | Entire DR-0      | 82 pages; §1–§48                                              |
| DR-0 package                         | `docs/program/`                                        | Reconciliation   | This audit                                                    |
| Phase crosswalk                      | `docs/program/directive-phase-crosswalk.md`            | GAP-002          | MD §42 ↔ technical-roadmap                                    |
| Technical roadmap (legacy numbering) | `docs/technical-roadmap.md`                            | DEV-PHASE-01     | Must be reconciled                                            |
| Discovery set (§2)                   | `docs/discovery/*`                                     | §2               | 9 required files present                                      |
| Project status                       | `docs/project-status.md`                               | §46              | Likely stale — refresh in DR-1                                |
| Architecture ADRs                    | `docs/architecture/`                                   | §3, §8, §10, §23 | ADR-012 tenancy; ADR-018 sensitive IDs; ADR-019 subscriptions |
| Platform API                         | `apps/platform-api/`                                   | §3, §28          | Consolidated API (DEV-API-01)                                 |
| Platform worker                      | `apps/platform-worker/`                                | §29, jobs        | Outbox / workers                                              |
| RMS web                              | `apps/rms-web/`                                        | §20, FX          | NERIS/CAD/FX                                                  |
| Academy web                          | `apps/academy-web/`                                    | §19              | Scaffold only                                                 |
| Creator console                      | `apps/creator-console/`                                | §22              | Partial                                                       |
| Config / Import packages             | `packages/*`                                           | §12–§17          | Config + import strong; export absent                         |
| Database migrations                  | `packages/database/migrations/`                        | §37              | 0000–0027                                                     |
| Infra CDK                            | `infra/`                                               | §4, §6, §40      | Landing zone / backup / monitoring                            |
| Security docs                        | `docs/security/`                                       | §31–§32          | Partial vs exact §31 list                                     |
| NERIS track                          | `docs/neris/` / RMS modules                            | §20.11           | P1–P4; P5 blocked                                             |
| Import track                         | `docs/import/` (or sprint summaries)                   | §17              | S1–S8                                                         |
| FX track                             | `docs/forge-experience/`                               | Adjacent UX      | S0–S2F; pilot/GA packs                                        |
| Pilot / GA                           | `docs/forge-experience/products/rms/pilot/`, `.../ga/` | FX-P1/P2         | Pilot blocked on tenant UUID                                  |
| GovCloud                             | `docs/discovery/` govcloud register; stubs             | §39 / Phase 12   | Pack incomplete                                               |
| Cursor / AWS rules                   | `.cursor/rules/`                                       | §43              | aws-agent-rules present                                       |

## Evidence gaps (need locate or create)

| Missing / weak                                               | Directive         | Action                       |
| ------------------------------------------------------------ | ----------------- | ---------------------------- |
| Exact `docs/data-model/core-platform-data-model.md`          | §7                | Locate or create (GAP-DM-01) |
| `docs/govcloud/` pack                                        | §39               | Create before Phase 12       |
| Full OpenAPI artifact                                        | §28               | Expand                       |
| Export / QR / notifications / documents / reporting packages | §17A–§18, §25–§27 | Not started                  |
| Formal DR restore drill record                               | §40               | Schedule                     |
| `project-status.md` refresh                                  | §46               | DR-1                         |
