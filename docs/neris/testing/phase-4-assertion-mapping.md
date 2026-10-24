# NERIS Phase 4 — 30-row assertion mapping (deterministic closeout)

**Date:** 2026-07-27  
**Environment:** development Cognito (`forge-dev`)  
**Allowed results:** PASS | FAIL | BLOCKED

| #   | Scenario                    | Test file                             | Test name                         | Key assertions                                                    | Fixture                   | Tenant | Permission        | Result | Evidence        |
| --- | --------------------------- | ------------------------------------- | --------------------------------- | ----------------------------------------------------------------- | ------------------------- | ------ | ----------------- | ------ | --------------- |
| 1   | CAD flags off → forbidden   | `phase-4-cad-acceptance.spec.ts`      | `1 — CAD flags off (tenant B)`    | connections GET → 403/404                                         | secondary Cognito         | B      | none (flags off)  | PASS   | Playwright list |
| 2   | Flags on → connections OK   | `phase-4-cad-acceptance.spec.ts`      | `2 — CAD flags on (A)`            | GET connections 200 + array                                       | primary                   | A      | connection.view   | PASS   | Playwright list |
| 3   | B cannot list A CAD         | `phase-4-cad-acceptance.spec.ts`      | `3/24 — Tenant B cannot…`         | cross-tenant connections/messages/conflicts/mappings denied       | primary+secondary         | A vs B | isolation         | PASS   | Playwright list |
| 4   | PRODUCTION create rejected  | `phase-4-cad-acceptance.spec.ts`      | `4 — PRODUCTION…`                 | POST → 4xx + PRODUCTION                                           | primary                   | A      | connection.manage | PASS   | Playwright list |
| 5   | Create DEVELOPMENT draft    | `phase-4-cad-acceptance.spec.ts`      | `5/6/7 — create…`                 | status DRAFT, env DEVELOPMENT                                     | primary                   | A      | connection.manage | PASS   | Playwright list |
| 6   | Test connection health      | `phase-4-cad-acceptance.spec.ts`      | `5/6/7 — create…`                 | test → HEALTHY/UNKNOWN/DEGRADED                                   | primary                   | A      | connection.test   | PASS   | Playwright list |
| 7   | Enable / disable            | `phase-4-cad-acceptance.spec.ts`      | `5/6/7 — create…`                 | ACTIVE then DISABLED                                              | primary                   | A      | enable/disable    | PASS   | Playwright list |
| 8   | Unsigned webhook 401        | `phase-4-cad-acceptance.spec.ts`      | `8 — webhook without signature`   | unsigned + invalid-sig → 401/403                                  | primary + enabled webhook | A      | public webhook    | PASS   | Playwright list |
| 9   | Simulator DIRECT_QUEUE      | `phase-4-cad-acceptance.spec.ts`      | `9/10 — simulator…`               | send accepted                                                     | primary                   | A      | simulator         | PASS   | Playwright list |
| 10  | Message metadata no raw     | `phase-4-cad-acceptance.spec.ts`      | `9/10 — simulator…`               | no rawPayload/payloadJson                                         | primary                   | A      | message.view      | PASS   | Playwright list |
| 11  | Manual create in hybrid     | `phase-4-cad-acceptance.spec.ts`      | `11/17 — hybrid…`                 | createManualIncident succeeds                                     | primary                   | A      | incident create   | PASS   | Playwright list |
| 12  | Ops summary needs flag      | `phase-4-cad-acceptance.spec.ts`      | `12/13 — operations…`             | summary 200 when ops flag on                                      | primary                   | A      | operations.view   | PASS   | Playwright list |
| 13  | Ops queue counters          | `phase-4-cad-acceptance.spec.ts`      | `12/13 — operations…`             | summary has ops fields                                            | primary                   | A      | operations.view   | PASS   | Playwright list |
| 14  | Unmapped values list        | `phase-4-cad-acceptance.spec.ts`      | `14/15/16 — unmapped…`            | GET unmapped-values 200 array                                     | primary                   | A      | unmapped.view     | PASS   | Playwright list |
| 15  | Unknown units/personnel     | `phase-4-cad-acceptance.spec.ts`      | `14/15/16 — unmapped…`            | GET unknown-* 200 arrays                                          | primary                   | A      | mapping.view      | PASS   | Playwright list |
| 16  | Conflicts list              | `phase-4-cad-acceptance.spec.ts`      | `14/15/16 — unmapped…`            | GET conflicts 200 array                                           | primary                   | A      | conflict.view     | PASS   | Playwright list |
| 17  | Manual link requires reason | `phase-4-cad-acceptance.spec.ts`      | `11/17 — hybrid…`                 | no reason 4xx; with reason 2xx                                    | primary + connection      | A      | incident.link     | PASS   | Playwright list |
| 18  | Rotate secret metadata only | `phase-4-cad-acceptance.spec.ts`      | `18 — rotate secret…`             | webhookKeyId; no secret value fields                              | primary                   | A      | rotate_secret     | PASS   | Playwright list |
| 19  | Reprocess audited path      | `phase-4-reprocess.spec.ts`           | `reprocess quarantined message…`  | own message, quarantine, attempts++, hash stable, audit, B denied | primary+secondary         | A      | message.reprocess | PASS   | Playwright list |
| 20  | Incident CAD status         | `phase-4-cad-acceptance.spec.ts`      | `20 — incident CAD status…`       | links + openConflicts arrays                                      | primary + incident        | A      | cad.view          | PASS   | Playwright list |
| 21  | CAD Operations nav          | `phase-4-cad-acceptance.spec.ts`      | `21/22 — RMS CAD…`                | heading + nav link visible                                        | primary                   | A      | UI + ops flag     | PASS   | Playwright list |
| 22  | CAD Connections page        | `phase-4-cad-acceptance.spec.ts`      | `21/22 — RMS CAD…`                | connections heading visible                                       | primary                   | A      | UI + cad flag     | PASS   | Playwright list |
| 23  | KEEP_FORGE resolve          | `phase-4-keep-forge-conflict.spec.ts` | `KEEP_FORGE conflict resolution…` | conflict created, resolve, forge unchanged, audit, B denied       | primary+secondary         | A      | conflict.resolve  | PASS   | Playwright list |
| 24  | Cross-tenant CAD status     | `phase-4-cad-acceptance.spec.ts`      | `3/24 — Tenant B cannot…`         | cad-status denied                                                 | primary+secondary         | A vs B | isolation         | PASS   | Playwright list |
| 25  | Finalized unlink guards     | `phase-4-cad-acceptance.spec.ts`      | `25 — finalized…`                 | bogus unlink → 403/404                                            | primary                   | A      | unlink            | PASS   | Playwright list |
| 26  | Simulator outage DEGRADED   | `phase-4-cad-acceptance.spec.ts`      | `26/27 — simulator outage…`       | outage accepted / degraded health                                 | primary                   | A      | simulator         | PASS   | Playwright list |
| 27  | Simulator recover           | `phase-4-cad-acceptance.spec.ts`      | `26/27 — simulator outage…`       | recover accepted                                                  | primary                   | A      | simulator         | PASS   | Playwright list |
| 28  | Mobile CAD operations       | `phase-4-cad-acceptance.spec.ts`      | `28 — mobile viewport…`           | heading visible @390x844                                          | primary                   | A      | UI                | PASS   | Playwright list |
| 29  | A11y CAD operations         | `phase-4-cad-acceptance.spec.ts`      | `29 — accessibility smoke…`       | heading focusable; no PII chrome                                  | primary                   | A      | UI                | PASS   | Playwright list |
| 30  | Phase 2/3 regression smoke  | `phase-4-cad-acceptance.spec.ts`      | `30 — Phase 2/3 regression…`      | login + manual incident + workspace                               | primary                   | A      | incident          | PASS   | Playwright list |

## Conditional-skip removal confirmation

Removed from `phase-4-cad-acceptance.spec.ts`:

- Early return when no CAD messages for reprocess
- Early return / annotation when no OPEN conflict for KEEP_FORGE
- `test.skip(!hasSecondaryCredentials())` replaced with hard `expect(...).toBe(true)`

Dedicated deterministic specs own their prerequisites:

- `phase-4-keep-forge-conflict.spec.ts`
- `phase-4-reprocess.spec.ts`

Closeout Playwright evidence (2026-07-27): `@phase4` **20 passed**; full chromium **53 passed**.
