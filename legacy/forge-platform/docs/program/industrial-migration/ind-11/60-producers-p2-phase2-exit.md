# Producers P2 — Phase 2 Exit (Cognito roster)

**Date:** 2026-08-05  
**Status:** **EXIT GREEN** (staging dress + dark prod twin; Firebase Auth still production; no Phase 5 announce)  
**Authority:** Auth export + Cognito create + prod-twin link approvals under `evidence/p2/02-cognito/`  
**Phase 1 exit:** [`58-producers-p2-phase1-exit.md`](58-producers-p2-phase1-exit.md)  
**Prep:** [`59-producers-p2-phase2-prep.md`](59-producers-p2-phase2-prep.md)

---

## Exit criteria vs result

| Criterion (plan 56)                          | Result                                                                                                                  |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Read-only Firebase Auth export for Producers | **PASS** — freeze 6 users (`roster-export-2026-08-05T20-16-50-164Z.json`)                                               |
| Map → Cognito + tenant membership + roles    | **PASS** — admin / operator map (`roster-map-plan.json`)                                                                |
| Bulk Cognito create (temp + force change)    | **PASS** — staging; 4 created; SUPPRESS delivery                                                                        |
| Login smoke role templates                   | **PASS** — force-change + API bootstrap for admin (`safetyadmin@`) + operator (`jlackie@`) on staging **and** prod twin |
| Comms: URL + first-login path                | **PASS** draft — `OPERATOR-FIRST-LOGIN-COMMS-DRAFT.md` (**not sent**)                                                   |
| Firebase Auth remains enabled                | **PASS** — fail-closed held                                                                                             |

---

## Freeze + create summary

| Metric                                      | Count                             |
| ------------------------------------------- | --------------------------------- |
| Auth users in project                       | 10                                |
| Producers matched                           | **6**                             |
| Cognito created (new)                       | 4                                 |
| Linked existing Cognito                     | 1+                                |
| Staging Aurora memberships                  | 6/6                               |
| Prod-twin Aurora memberships                | 6/6                               |
| Exceptions (missing email / disabled / dup) | 0 / 0 / 0                         |
| Multi-business                              | 1 (`admin@forgepublicsafety.com`) |

---

## Evidence index

| Gate                     | Evidence                                                                   |
| ------------------------ | -------------------------------------------------------------------------- |
| Auth export approve      | `APPROVE-PRODUCERS-AUTH-EXPORT.md`                                         |
| Freeze                   | `roster-export-*.json`, `roster-count-summary.json`                        |
| Map                      | `roster-map-plan.json`                                                     |
| Cognito create approve   | `APPROVE-PRODUCERS-COGNITO-CREATE.md`                                      |
| Create result            | `cognito-create-staging-result.json` (no passwords)                        |
| Staging link             | `link-staging-roster-result.json`                                          |
| H4 smoke                 | `login-smoke-force-change.json`, `login-smoke-staging.json`                |
| Prod-twin approve + link | `APPROVE-PRODUCERS-PROD-TWIN-LINK.md`, `link-prod-twin-roster-result.json` |
| Prod-twin smoke          | `login-smoke-prod-twin.json`                                               |
| Comms draft              | `OPERATOR-FIRST-LOGIN-COMMS-DRAFT.md`                                      |
| Index                    | `evidence/p2/02-cognito/INDEX.md`                                          |

**Secrets:** temporary / smoke passwords only under `~/.forge/producers-p2/` — never committed.

---

## Known gaps (acceptable for Phase 2 exit)

| Gap                                                | Disposition                                       |
| -------------------------------------------------- | ------------------------------------------------- |
| Operator comms not plant-approved / not sent       | Soft — send before UAT broaden                    |
| Remaining users may still be FORCE_CHANGE_PASSWORD | Complete at first login or coordinated reset      |
| No Hosted UI browser recording in evidence         | API AdminInitiateAuth + bootstrap accepted for H4 |
| Supervisor role unused (no freeze roleHints)       | Expand if plant defines supervisors               |
| Module `IMPORT` absent from catalog                | Carry to Phase 4 / catalog                        |

---

## Phase 3 entry

Phase 3 (**Storage → S3**) may start when:

1. This Phase 2 exit remains green
2. Phase 0 file decision / AV approach for Storage accepted (plan 56)
3. Operator confirms **“begin Phase 3 Storage inventory”** (read-only first)

**Fail-closed:** Do not disable Firebase Auth or announce SoT flip until Phase 5/6.

---

## Explicit non-entry

- Phase 5 DNS announce / SoT flip
- IND-13 fleet Cognito import
- Dual-write Firebase ↔ Aurora
