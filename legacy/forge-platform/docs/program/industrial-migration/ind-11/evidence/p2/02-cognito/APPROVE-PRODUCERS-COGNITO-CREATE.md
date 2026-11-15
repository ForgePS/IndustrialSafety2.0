# APPROVE PRODUCERS COGNITO CREATE (Phase 2 staging)

**Status:** SIGNED — AUTHORIZED (staging Cognito create + staging-tenant link)  
**Drafted:** 2026-08-05  
**Signed:** 2026-08-05  
**Governing docs:** DEC-IND-011 · `59-producers-p2-phase2-prep.md` · Auth freeze `roster-export-2026-08-05T20-16-50-164Z.json`

---

## Authorization

| Field | Value |
| --- | --- |
| Scope | Cognito `AdminCreateUser` for freeze roster + Aurora membership on **staging only** |
| Target Cognito pool | `us-east-1_VYjUFLXG4` |
| Target tenant | `producers-rice-mill-staging` (`0882c865-59c2-49a6-ab88-ce6ca89be30c`) |
| Roster freeze | 6 users — `2026-08-05T20:16:50.164Z` |
| Password | Temp password + force change; delivery **SUPPRESS** (dev) |
| Temp password storage | Local only `~/.forge/producers-p2/` — **never committed** |

## Role assignment (locked this run)

| Email | Action | Role |
| --- | --- | --- |
| `admin@forgepublicsafety.com` | Link existing Cognito (no create) | `IND3V_INDUSTRIAL_ADMIN` (already linked) |
| `safetyadmin@producersrice.com` | Create if missing | `IND3V_INDUSTRIAL_ADMIN` |
| Other `@producersrice.com` freeze users | Create if missing | `IND3V_INDUSTRIAL_OPERATOR` (view-capable day-1) |

## Explicitly NOT authorized

| Workstream | Status |
| --- | --- |
| Prod twin (`producers-rice-mill`) Cognito/membership create | NOT AUTHORIZED yet |
| Email delivery of temp passwords to operators | NOT AUTHORIZED (SUPPRESS) |
| Disable Firebase Auth / SoT flip | NOT AUTHORIZED |
| Commit temp passwords to git | NOT AUTHORIZED |

## Preconditions

- [x] Auth export approval signed  
- [x] Roster freeze accepted (6 users)  
- [x] This record signed  
- [x] Operator continues with map + staging create in session  

## Signatures

| Role | Name | Signature | Date |
| --- | --- | --- | --- |
| Program Owner | Jeremy | APPROVED (electronic, Cursor session 2026-08-05 — continue → map-sign-create) | 2026-08-05 |

## Evidence destination

`docs/program/industrial-migration/ind-11/evidence/p2/02-cognito/` (no password material)
