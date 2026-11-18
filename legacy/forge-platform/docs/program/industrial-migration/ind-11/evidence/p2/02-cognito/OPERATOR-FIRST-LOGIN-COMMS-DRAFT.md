# Producers P2 — Operator first-login / URL draft (I3)

**Status:** DRAFT — not announced to plant operators  
**Date:** 2026-08-05  
**Audience:** Producers Rice Mill Industrial users (Firebase Auth roster)  
**Hostname (dark / pre-announce):** `https://producers-rice-mill.forgepublicsafety.com/`  
**Do not** treat this as production SoT cutover (Phase 5 still required)

---

## Purpose

Tell operators how they will sign in to the **AWS Industrial** pilot host after Cognito accounts are issued, without announcing a Firebase SoT flip.

---

## Suggested email / Teams message

**Subject:** Forge Industrial — new AWS login (pilot / do not use for production SoT yet)

Hello,

We are preparing **Forge Industrial** on AWS for Producers Rice Mill.

### What this is
- A **pilot** login for the AWS Industrial site  
- Firebase remains the **production source of truth** until a later cutover window is announced  
- Do **not** enter production-only work here until plant leadership says the cutover is live  

### Sign-in URL (bookmark this)
`https://producers-rice-mill.forgepublicsafety.com/`

### First login
1. Open the URL above.  
2. Sign in with your **work email** (same as today).  
3. If prompted for a **temporary password**, enter the one from IT / Safety Administration, then **set a new password** when Cognito asks.  
4. After sign-in, confirm the tenant shows **Producers Rice Mill** (or **Producers Rice Mill (Staging)** if you were given staging access).  

### If something fails
- Wrong tenant / “Product not entitled” — contact Safety Administration / Jeremy before retrying on another site  
- Forgot temporary password — do **not** reuse an old Firebase password; request a reset from the pilot operator  
- This site is **pre-announce**: avoid sharing the URL outside the pilot group until Phase 5  

### What stays the same for now
- Continue using the current Firebase Industrial app for **production** day-to-day work until cutover is announced  

Thanks,  
Forge / Producers pilot team  

---

## Operator notes (internal)

| Item | Detail |
| --- | --- |
| Cognito pool | `us-east-1_VYjUFLXG4` · Industrial client `3rls…` |
| Freeze roster | 6 users (`evidence/p2/02-cognito/roster-export-latest.json`) |
| Staging + prod twin memberships | Linked for all 6 |
| Force-change smoke | Done for `safetyadmin@` + `jlackie@` |
| Remaining FORCE_CHANGE_PASSWORD | Other createes still need first login or coordinated password issue |
| Temp passwords (pilot ops) | Local only under `~/.forge/producers-p2/` — never email wholesale without SEC review |
| Delivery in Cognito create | `MessageAction=SUPPRESS` — no auto email from Cognito in this phase |

---

## Send checklist (before broad distribution)

- [ ] Plant ops / Safety Admin approve wording  
- [ ] Temporary password handoff path defined (in-person / sealed channel — not public chat)  
- [ ] Support contact named in message (currently Jeremy per auth record)  
- [ ] Explicit “Firebase still production SoT” line retained  
- [ ] Phase 5 announce **not** implied by this draft  

---

## References

- `59-producers-p2-phase2-prep.md` (E4 / I3)  
- `APPROVE-PRODUCERS-AWS-PRIMARY-PILOT.md`  
- `login-smoke-staging.json` / `login-smoke-prod-twin.json`  
