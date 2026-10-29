# Producers P2 — Phase 1 Prep Checklist

**Date:** 2026-08-05  
**Status:** Phase 1 **EXIT GREEN** — see [`58-producers-p2-phase1-exit.md`](58-producers-p2-phase1-exit.md)  
**Authorization:** SIGNED — `evidence/p2/00-authorization/APPROVE-PRODUCERS-AWS-PRIMARY-PILOT.md`  
**Plan:** `56-producers-p2-execution-plan.md`

## Locked naming

| Env          | `tenant_key`                  | Display name (proposed)       | Hostname                                               |
| ------------ | ----------------------------- | ----------------------------- | ------------------------------------------------------ |
| Staging-prod | `producers-rice-mill-staging` | Producers Rice Mill (Staging) | TBD staging alias OR temporary CF URL until cert ready |
| Production   | `producers-rice-mill`         | Producers Rice Mill           | `https://producers-rice-mill.forgepublicsafety.com/`   |

Firebase SoT org (unchanged until Phase 5): `business-1782553339499`.

**Do not** reuse or promote `import-acceptance-tenant-a` (`019faa15-e558-70b6-adcd-a510c3c995f4`).

---

## Phase 1 work packages

### A. Tenants and authz

| #   | Task                                                                                 | Status                                                  |
| --- | ------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| A1  | Create tenants `producers-rice-mill-staging` and `producers-rice-mill` in Aurora     | **DONE** (`tenant-ids.json`)                            |
| A2  | Seed Industrial roles/personas (IND-3V pattern: industrial admin + operator) on both | **DONE** (admin synthetic; viewer deferred)             |
| A3  | Activate `FORGE_INDUSTRIAL` product on both                                          | **DONE**                                                |
| A4  | Entitle day-1 modules (locked allowlist in plan 56)                                  | **DONE** (15/16 — `IMPORT` module missing from catalog) |
| A5  | Tenant feature-flag overrides ON (global defaults stay OFF)                          | **DONE** (16 flags)                                     |
| A6  | Cross-tenant negative smoke vs acceptance-A and forge-platform                       | **DONE** (`p2-api-smoke-a6.json`)                       |

### B. Cognito / app clients

| #   | Task                                                                             | Status                                                                                            |
| --- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| B1  | Confirm Industrial Cognito client callback URLs include staging + prod subdomain | **DONE** (prod subdomain + existing CF/dev URLs kept)                                             |
| B2  | Logout URLs for both hostnames                                                   | **DONE** (`producers-rice-mill.forgepublicsafety.com` + nested keep)                              |
| B3  | API JWT client allowlist includes Industrial client                              | **DONE** (`b3-cognito-client-allowlist.json` — includes `3rls…`)                                  |
| B4  | Synthetic admin user for staging smoke (before full roster import)               | **DONE** (DB persona; creator Cognito also linked for operator smoke — full roster still Phase 2) |

### C. Edge / DNS (dark)

| #   | Task                                                                 | Status                                                                                           |
| --- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| C1  | ACM certificate covering Producers hostname                          | **DONE** — existing `*.forgepublicsafety.com` covers flat hostname                               |
| C2  | CloudFront alias binding draft (deploy dark / not announced)         | **DONE** — alias `producers-rice-mill.forgepublicsafety.com` on `EXIC8HBMJ4I2Z`                  |
| C3  | DNS records prepared but not pointed for end users until Phase 5     | **DONE** CNAME live (`dns-producers-rice-mill-verified.json`) — still pre-announce until Phase 5 |
| C4  | Industrial static site build points at correct API base for each env | **DONE** (`c4-industrial-api-base.json` → `https://api-dev.forgepublicsafety.com`)               |

### D. Evidence / gates

| #   | Task                                                                 | Status                                           |
| --- | -------------------------------------------------------------------- | ------------------------------------------------ |
| D1  | Record tenant UUIDs in `evidence/p2/01-tenant-infra/tenant-ids.json` | **DONE**                                         |
| D2  | Staging bootstrap smoke: `/auth/me` + `/industrial/bootstrap`        | **DONE** (API + browser on prod twin host)       |
| D3  | Update auth record with tenant UUIDs after provision                 | **DONE** (auth record Target AWS tenant row)     |
| D4  | Support/rollback contacts filled on auth record                      | **DONE** (Jeremy primary; plant ops TBD Phase 5) |

---

## Day-1 module entitlement codes (copy into seed scripts)

```text
PERSONNEL
EQUIPMENT
LOCKOUT_TAGOUT
TRAINING
FORMS
INSPECTIONS
INCIDENTS
QR_LINKS
CONFINED_SPACE
HOT_WORK
TASKS
MESSAGING
EMERGENCY_RESPONSE
DOCUMENTS
REPORTING
IMPORT
```

(Sites/Areas ride under equipment/LOTO APIs — ensure site list permissions covered by industrial.access + equipment/loto entitlements.)

---

## Explicit non-goals for Phase 1

- No Firebase Auth → Cognito full roster import (Phase 2)
- No Storage → S3 copy (Phase 3)
- No Producers production SoT flip / DNS announce (Phase 5)
- No IND-13 fleet cutover

---

## Ready-to-execute criteria

Phase 1 **execution** may start when:

1. This prep checklist accepted
2. Auth record remains SIGNED
3. Operator confirms **“begin Phase 1 provision”** in session
4. Prefer: support contacts filled (soft gate — may capture in parallel)

---

## Immediate prep actions (docs/scripts, still no provision)

1. Draft `tenant-ids.json` template (empty UUIDs).
2. Sketch seed/entitlement runner mirror of `ind11b-p1-link-creator` / flags enable for new keys.
3. List CDK/DNS certificate steps for subdomain under existing `industrial.forgepublicsafety.com` zone (if owned).

## References

- Signed auth: `evidence/p2/00-authorization/APPROVE-PRODUCERS-AWS-PRIMARY-PILOT.md`
- Plan: `56-producers-p2-execution-plan.md`
- Dev acceptance pattern: `scripts/ind11b-p1-link-creator-tenant-a.mjs`, `ind11b-p1-enable-tenant-a-flags.mjs`
