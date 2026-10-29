# Producers P2 — Phase 1 Exit

**Date:** 2026-08-05  
**Status:** **EXIT GREEN** (pre-announce / not Phase 5 SoT)  
**Authority:** `APPROVE-PRODUCERS-AWS-PRIMARY-PILOT.md` (SIGNED) · plan `56` · checklist `57`  
**Hostname (dark):** `https://producers-rice-mill.forgepublicsafety.com/`

---

## Exit criteria vs result

| Criterion (plan 56)                                        | Result                                                   |
| ---------------------------------------------------------- | -------------------------------------------------------- |
| Staging + production twin tenants exist (not acceptance-A) | **PASS** — staging `0882c865-…` · prod `5da680d3-…`      |
| Personas / roles + FORGE_INDUSTRIAL + day-1 modules        | **PASS** — 15/16 modules (`IMPORT` missing from catalog) |
| Tenant feature-flag overrides ON                           | **PASS**                                                 |
| Cognito Industrial callbacks include Producers host        | **PASS**                                                 |
| CloudFront alias + ACM coverage                            | **PASS** (flat hostname)                                 |
| DNS CNAME live to CF (pre-announce)                        | **PASS** — operators not announced                       |
| API CORS allows Producers origin                           | **PASS** (ECS `:65` + CDK)                               |
| `/auth/me` + `/industrial/bootstrap` for entitled admin    | **PASS** (API + browser)                                 |
| Cross-tenant negatives (A6)                                | **PASS**                                                 |
| Subdomain not announced as production SoT                  | **PASS** — Firebase remains SoT                          |

---

## Evidence index

| Gate               | Evidence                                                                                                                         |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| Auth / D3–D4       | `evidence/p2/00-authorization/APPROVE-PRODUCERS-AWS-PRIMARY-PILOT.md`                                                            |
| Tenant IDs         | `evidence/p2/01-tenant-infra/tenant-ids.json`                                                                                    |
| Seed               | `phase1-seed-result.json`                                                                                                        |
| Cognito / CF / DNS | `cognito-industrial-client-after-flat-hostname.json`, `cf-industrial-config-after.json`, `dns-producers-rice-mill-verified.json` |
| CORS               | `CORS-HOTFIX-producers-rice-mill.md`, `cors-taskdef-after.json`                                                                  |
| B3 allowlist       | `b3-cognito-client-allowlist.json`                                                                                               |
| Creator link       | `p2-link-creator-producers-result.json`                                                                                          |
| A6 API smoke       | `p2-api-smoke-a6.json`                                                                                                           |
| C4 API base        | `c4-industrial-api-base.json`                                                                                                    |
| Browser smoke      | `BROWSER-SMOKE-producers-tenant.md`                                                                                              |
| Checklist          | `57-producers-p2-phase1-prep.md`                                                                                                 |

---

## Known gaps (acceptable for Phase 1 exit)

| Gap                                                | Disposition                                             |
| -------------------------------------------------- | ------------------------------------------------------- |
| Platform module `IMPORT` absent from catalog       | Carry into Phase 4 / catalog fix; not a Phase 1 blocker |
| Full Cognito operator roster not imported          | **Phase 2**                                             |
| Producers plant-ops contact + cutover calendar     | Soft gate — fill before Phase 5                         |
| No Industrial tenant switcher in shell navbar      | Sticky `forge-active-tenant-id` works; UX backlog       |
| Acceptance-A still holds loaded Producers **data** | Do not promote; Phase 4 loads onto Producers tenants    |

---

## Phase 2 entry

Phase 2 (**Cognito import for Producers operators**) may start when:

1. This Phase 1 exit remains green
2. Read-only Firebase Auth export for `business-1782553339499` is approved
3. Temp-password / force-change comms path agreed

**Fail-closed:** Do not disable Firebase Auth for Producers until Phase 5/6.

---

## Explicit non-entry (do not start yet)

- Phase 3 Storage → S3 (unless overlapping planning only)
- Phase 5 DNS announce / SoT flip
- IND-13 fleet cutover / dual-write
