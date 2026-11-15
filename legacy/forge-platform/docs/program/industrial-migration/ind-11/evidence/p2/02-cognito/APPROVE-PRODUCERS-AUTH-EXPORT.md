# APPROVE PRODUCERS AUTH EXPORT (Phase 2)

**Status:** SIGNED — AUTHORIZED (read-only Auth export)  
**Drafted:** 2026-08-05  
**Signed:** 2026-08-05  
**Governing docs:** DEC-IND-011 · `56-producers-p2-execution-plan.md` · `59-producers-p2-phase2-prep.md` · `33-user-migration-plan.md`

---

## Authorization requested

| Field | Value |
| --- | --- |
| Scope | Read-only Firebase Authentication user list for Producers Rice Mill |
| Firebase project | `forge-industrial-safety` |
| Firebase business | `business-1782553339499` |
| Purpose | Freeze roster counts + mapping inputs for Cognito temp-password import |
| Writes | **NONE** — list/export only; no Cognito create in this approval |
| Password hashes | **NOT** extracted / migrated |

## Allowed data fields

- `uid`, `email`, `emailVerified`, `disabled`  
- `metadata` creation / last-sign-in timestamps  
- Custom claims needed for business/role mapping (non-secret)  
- Display name if present  

## Explicitly NOT authorized by this record

| Workstream | Status |
| --- | --- |
| Cognito AdminCreateUser / bulk import | NOT AUTHORIZED (separate E3 approval) |
| Disable Firebase Auth for Producers | NOT AUTHORIZED |
| Full IND-13 fleet Auth export | NOT AUTHORIZED |
| Storage / Firestore document body dump beyond Auth roster needs | NOT AUTHORIZED |

## Preconditions

- [x] Phase 1 exit green (`58-producers-p2-phase1-exit.md`)  
- [x] Pilot AWS-primary auth signed  
- [x] This record signed by Program Owner  
- [x] Operator confirms “begin Phase 2 Auth export” in session after signature  

## Signatures

| Role | Name | Signature | Date |
| --- | --- | --- | --- |
| Program Owner | Jeremy | APPROVED (electronic, Cursor session 2026-08-05 — “begin pase 2 auth export”) | 2026-08-05 |
| Platform / Ops Lead (optional) | | | |

## Evidence destination

`docs/program/industrial-migration/ind-11/evidence/p2/02-cognito/`
