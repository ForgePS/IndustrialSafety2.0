# NERIS Phase 4 — Cognito acceptance scenario matrix (30)

**Tags:** `@phase4` `@cad` `@cad-security` `@cad-hybrid` `@cad-operations`  
**Tenant A:** `rms-synthetic-fd` · **Tenant B:** `rms-synthetic-fd-b`  
**Phase 5:** NOT AUTHORIZED

| #   | Tag               | Scenario                                                  |
| --- | ----------------- | --------------------------------------------------------- |
| 1   | `@cad`            | CAD flags off → CAD APIs forbidden                        |
| 2   | `@cad`            | CAD flags on (A) → connections list OK                    |
| 3   | `@cad-security`   | Tenant B cannot list Tenant A CAD resources               |
| 4   | `@cad-security`   | PRODUCTION connection create rejected                     |
| 5   | `@cad`            | Create DEVELOPMENT webhook connection (draft)             |
| 6   | `@cad`            | Test connection → health HEALTHY                          |
| 7   | `@cad`            | Enable / disable connection                               |
| 8   | `@cad-security`   | Webhook without signature → 401                           |
| 9   | `@cad`            | Simulator DIRECT_QUEUE send accepted                      |
| 10  | `@cad`            | Message metadata list excludes raw payload fields         |
| 11  | `@cad-hybrid`     | Manual incident create remains available in hybrid        |
| 12  | `@cad`            | Operations summary requires operations flag               |
| 13  | `@cad-operations` | Operations summary returns queue counters                 |
| 14  | `@cad`            | Unmapped values list                                      |
| 15  | `@cad`            | Unknown units / personnel lists                           |
| 16  | `@cad`            | Conflict list endpoint                                    |
| 17  | `@cad-hybrid`     | Manual link requires reason                               |
| 18  | `@cad-security`   | Rotate secret returns key metadata only (no secret value) |
| 19  | `@cad`            | Reprocess message audited path                            |
| 20  | `@cad`            | Incident CAD status panel data endpoint                   |
| 21  | `@cad-operations` | RMS CAD Operations nav visible when flags on              |
| 22  | `@cad`            | RMS CAD Connections page loads                            |
| 23  | `@cad-hybrid`     | Ownership conflict resolve KEEP_FORGE                     |
| 24  | `@cad-security`   | Cross-tenant CAD status denied                            |
| 25  | `@cad`            | Finalized incident unlink / mutation guards (API)         |
| 26  | `@cad`            | Simulator outage → connection DEGRADED                    |
| 27  | `@cad`            | Simulator recover → HEALTHY                               |
| 28  | `@cad`            | Mobile viewport CAD operations page                       |
| 29  | `@phase4`         | Accessibility smoke — CAD operations headings             |
| 30  | `@phase4`         | Phase 2/3 regression smoke — login + incidents still work |

Implementations live under `apps/rms-web-e2e/tests/phase-4-*.spec.ts`.
