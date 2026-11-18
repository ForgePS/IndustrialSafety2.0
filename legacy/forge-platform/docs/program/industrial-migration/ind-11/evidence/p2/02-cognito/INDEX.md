# Phase 2 Cognito evidence index

**Status:** Staging Cognito create + Aurora link complete for freeze roster  
**Prep:** `../../59-producers-p2-phase2-prep.md`

| Artifact | Purpose |
| --- | --- |
| `APPROVE-PRODUCERS-AUTH-EXPORT.md` | Gate for read-only Firebase Auth list — **SIGNED** |
| `roster-export-2026-08-05T20-16-50-164Z.json` | Freeze file (6 Producers users) |
| `roster-export-latest.json` | Latest freeze alias |
| `roster-count-summary.json` | Counts + exceptions |
| `roster-map-plan.json` | Cognito create / membership plan |
| `APPROVE-PRODUCERS-COGNITO-CREATE.md` | Gate for AdminCreateUser — **SIGNED** (staging) |
| `cognito-create-staging-result.json` | Create evidence (no passwords) |
| `link-staging-payload.json` | Subjects linked (no passwords) |
| `link-staging-roster-result.json` | Aurora link evidence |
| `APPROVE-PRODUCERS-PROD-TWIN-LINK.md` | Gate for prod-twin membership — **SIGNED** |
| `link-prod-twin-payload.json` | Subjects linked to prod twin |
| `link-prod-twin-roster-result.json` | Aurora prod-twin link evidence |
| `OPERATOR-FIRST-LOGIN-COMMS-DRAFT.md` | I3 operator URL + first-login draft (not announced) |

**Freeze counts (2026-08-05T20:16:50Z):** Auth total 10 · Producers matched **6**

**Staging create (2026-08-05T20:32:53Z):** Cognito created 4 · linked existing 1 · passwords issued 4 (local `~/.forge/producers-p2/` only) · Aurora linked **6/6**

**H4 smoke (2026-08-05T20:47Z):** FORCE_CHANGE_PASSWORD + API bootstrap PASS for safetyadmin (admin) and jlackie (operator) on staging tenant

**Prod twin (2026-08-05T20:59Z):** Membership link **6/6**; API smoke PASS on `producers-rice-mill` for safetyadmin + jlackie

**Temp / smoke passwords:** never committed — see local `~/.forge/producers-p2/`
