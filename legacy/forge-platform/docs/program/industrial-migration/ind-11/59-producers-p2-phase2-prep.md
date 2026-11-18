# Producers P2 — Phase 2 Prep Checklist (Cognito roster)

**Date:** 2026-08-05  
**Status:** Phase 2 **EXIT GREEN** — see [`60-producers-p2-phase2-exit.md`](60-producers-p2-phase2-exit.md)  
**Phase 1 exit:** [`58-producers-p2-phase1-exit.md`](58-producers-p2-phase1-exit.md) **GREEN**  
**Plan:** [`56-producers-p2-execution-plan.md`](56-producers-p2-execution-plan.md)  
**Foundational plan:** [`../33-user-migration-plan.md`](../33-user-migration-plan.md)

## Locked targets

| Env              | `tenant_key`                  | `tenant_id`                            | Cognito client                          |
| ---------------- | ----------------------------- | -------------------------------------- | --------------------------------------- |
| Staging dress    | `producers-rice-mill-staging` | `0882c865-59c2-49a6-ab88-ce6ca89be30c` | Industrial `3rls9835j4qs3jmchb3uh7ketm` |
| Prod twin (dark) | `producers-rice-mill`         | `5da680d3-50f5-46ac-8b85-6cf454b6a0da` | same pool / client                      |

| Source             | Value                                                                                   |
| ------------------ | --------------------------------------------------------------------------------------- |
| Firebase project   | `forge-industrial-safety`                                                               |
| Firebase business  | `business-1782553339499`                                                                |
| Cognito pool (dev) | `us-east-1_VYjUFLXG4`                                                                   |
| Password strategy  | Temp password + force change (**no** hash migration)                                    |
| Join key           | Normalized email (lowercase)                                                            |
| Hostname for comms | `https://producers-rice-mill.forgepublicsafety.com/` (still pre-announce until Phase 5) |

**Do not** import onto `import-acceptance-tenant-a`.

---

## Phase 2 work packages

### E. Authorization / freeze

| #   | Task                                                   | Status                                                      |
| --- | ------------------------------------------------------ | ----------------------------------------------------------- |
| E1  | Phase 1 exit remains green                             | **DONE** (`58`)                                             |
| E2  | Sign read-only Auth export approval for Producers org  | **DONE** 2026-08-05                                         |
| E3  | Sign Cognito bulk-create approval (staging first)      | **DONE** (`APPROVE-PRODUCERS-COGNITO-CREATE.md`)            |
| E4  | Comms draft: URL + first-login / password-change steps | **DONE** (`OPERATOR-FIRST-LOGIN-COMMS-DRAFT.md` — not sent) |

### F. Read-only Firebase Auth export

| #   | Task                                                                       | Status                                                                                |
| --- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| F1  | Tooling: allowlisted Auth list filtered to Producers business              | **DONE** (`scripts/ind11b-p2-auth-export-producers.mjs`)                              |
| F2  | Capture UID, email, disabled, emailVerified, metadata timestamps           | **DONE**                                                                              |
| F3  | Capture custom-claims business/role fields needed for mapping (no secrets) | **DONE** (businessIds + roleHints + claimKeys)                                        |
| F4  | Produce freeze file `roster-export-<date>.json` + count summary            | **DONE** (`roster-export-2026-08-05T20-16-50-164Z.json`, `roster-count-summary.json`) |
| F5  | Exception list: missing email, disabled, multi-business, duplicates        | **DONE** — see summary (1 multi-business; 0 missing/disabled/dup)                     |

### G. Mapping

| #   | Task                                                                                          | Status                                              |
| --- | --------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| G1  | Map each Auth user → target Cognito username = email                                          | **DONE** (`roster-map-plan.json`)                   |
| G2  | Assign AWS tenant membership(s): prefer staging for dress; prod twin only after staging smoke | **DONE** staging + prod twin                        |
| G3  | Role templates: admin / supervisor / operator → platform roles (`IND3V_*` or successor)       | **DONE** admin + operator (no supervisor in freeze) |
| G4  | Membership product + day-1 module access (mirror Phase 1 seed)                                | **DONE** (15 modules each)                          |
| G5  | De-dupe: existing Cognito users (e.g. `admin@forgepublicsafety.com`) → link not recreate      | **DONE**                                            |

### H. Cognito create (staging first)

| #   | Task                                                                       | Status                                                                                          |
| --- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| H1  | Dry-run Cognito AdminCreateUser plan (counts only)                         | **DONE** (map counts)                                                                           |
| H2  | Bulk create on staging tenant with temp password + `FORCE_CHANGE_PASSWORD` | **DONE** (4 created, temps local-only)                                                          |
| H3  | Persist `authentication_identities` + memberships/roles                    | **DONE** (`link-staging-roster-result.json`)                                                    |
| H4  | Login smoke: admin, supervisor, operator (+ sample N of roster)            | **DONE** — force-change + API `/auth/me` + bootstrap for `safetyadmin@` + `jlackie@` on staging |
| H5  | Count reconciliation vs F4 freeze (100% or documented exceptions)          | **DONE** 6/6                                                                                    |

### I. Prod twin (dark) — after staging green

| #   | Task                                                                                        | Status                                                                |
| --- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| I1  | Repeat create/link onto `producers-rice-mill` (or shared Cognito users + second membership) | **DONE** (membership link only — `link-prod-twin-roster-result.json`) |
| I2  | Dark hostname login smoke                                                                   | **DONE** API smoke on prod twin (`login-smoke-prod-twin.json`)        |
| I3  | Operator comms ready; still **no** Phase 5 SoT announce                                     | **DONE** draft ready — send gated by plant-ops approve                |

### J. Evidence

| #   | Task                                                 | Status                                      |
| --- | ---------------------------------------------------- | ------------------------------------------- |
| J1  | Folder `evidence/p2/02-cognito/`                     | **DONE** (scaffold)                         |
| J2  | Export + mapping + create result JSON (redact temps) | PENDING                                     |
| J3  | Phase 2 exit note                                    | **DONE** (`60-producers-p2-phase2-exit.md`) |

---

## Role mapping draft (confirm before import)

| Firebase / plant role signal | AWS role code (draft)                           | Notes                         |
| ---------------------------- | ----------------------------------------------- | ----------------------------- |
| Business / plant admin       | `IND3V_INDUSTRIAL_ADMIN`                        | Full day-1 manage perms       |
| Supervisor / lead            | `IND3V_INDUSTRIAL_SUPERVISOR` (seed if missing) | Approve + manage subset       |
| Operator / employee          | `IND3V_INDUSTRIAL_OPERATOR` (seed if missing)   | View + create where entitled  |
| Unknown / none               | Operator default + exception log                | Do not grant admin by silence |

Exact Firestore / claims field names: confirm during F3 against live (authorized) inventory — do not guess permanent mappings.

---

## Script sketch (not executed in this prep)

```text
scripts/ind11b-p2-auth-export-plan.mjs          # synthetic / refused without AUTH export approve
scripts/ind11b-p2-run-auth-export.mjs           # ECS/RO live — requires APPROVE signature + env gate
scripts/ind11b-p2-map-roster.mjs                # roster-export → membership plan JSON
scripts/ind11b-p2-cognito-create-dry-run.mjs    # AdminCreateUser plan only
scripts/ind11b-p2-run-cognito-create-staging.mjs
scripts/ind11b-p2-cognito-login-smoke.mjs
```

Gates (fail-closed):

- `FORGE_P2_AUTH_EXPORT_AUTHORIZED=true` only after E2 signed
- `FORGE_P2_COGNITO_CREATE_AUTHORIZED=true` only after E3 signed
- Default mode = dry-run / refuse live

---

## Explicit non-goals for Phase 2

- No password hash migration
- No Firebase Auth disable / SoT flip (Phase 5/6)
- No Storage → S3 (Phase 3)
- No full Aurora data reload onto Producers tenants (Phase 4)
- No IND-13 fleet Cognito import

---

## Ready-to-execute criteria

Phase 2 **execution** (live Auth list) may start when:

1. Phase 1 exit remains green
2. `APPROVE-PRODUCERS-AUTH-EXPORT.md` signed
3. Operator confirms **“begin Phase 2 Auth export”** in session

Cognito **creates** require a second signature (E3) after freeze counts accepted.

---

## Immediate prep actions (docs only — this pass)

1. Draft unsigned Auth export approval.
2. Scaffold `evidence/p2/02-cognito/`.
3. Point plan 56 at this checklist.

## References

- Auth: `../08-authentication-inventory.md`
- User migration: `../33-user-migration-plan.md`
- Rollback: `../35-rollback-strategy.md`
- Signed pilot auth: `evidence/p2/00-authorization/APPROVE-PRODUCERS-AWS-PRIMARY-PILOT.md`
