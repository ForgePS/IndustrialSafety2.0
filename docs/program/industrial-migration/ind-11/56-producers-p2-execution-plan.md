# Producers P2 Execution Plan — AWS Primary Pilot

**Date:** 2026-08-05  
**Status:** AUTHORIZED — Phase 1–2 **EXIT GREEN**; Phase 3 staging Storage→S3 **copy COMPLETE** (`61`) — Aurora metadata / URL rewrite still open  
**Authority:** DEC-IND-011, MD-1.0, DD-IND-1.0 · Signed record: `evidence/p2/00-authorization/APPROVE-PRODUCERS-AWS-PRIMARY-PILOT.md`  
**Product:** Forge Industrial Safety  
**Tenant focus:** Producers Rice Mill (`business-1782553339499`)  
**Target model:** AWS day-to-day primary for Producers only; Firebase read-oriented fallback  
**Not in scope:** Full IND-13 cutover for all Industrial tenants; true dual-write  
**Phase 1 exit:** [`58-producers-p2-phase1-exit.md`](58-producers-p2-phase1-exit.md)  
**Phase 2 exit:** [`60-producers-p2-phase2-exit.md`](60-producers-p2-phase2-exit.md)  
**Phase 3 prep:** [`61-producers-p2-phase3-prep.md`](61-producers-p2-phase3-prep.md)  
**Phase 3 exit:** [`62-producers-p2-phase3-exit.md`](62-producers-p2-phase3-exit.md) **GREEN** (N4 deferred)  
**Phase 4 prep:** [`63-producers-p2-phase4-prep.md`](63-producers-p2-phase4-prep.md)

## Goal

Move Producers Rice Mill operators from Firebase Industrial to AWS Industrial for normal plant work, without waiting for fleet-wide IND-13.

## Phase 0 decisions (LOCKED — 2026-08-05 workshop)

| Decision          | Choice                                                                                                                                                                          |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Target model      | AWS primary for Producers only; Firebase fallback                                                                                                                               |
| AWS tenant        | **New dedicated production tenant** (do not promote `import-acceptance-tenant-a`)                                                                                               |
| Environment path  | **Staging-prod dress rehearsal → production window**                                                                                                                            |
| Staging landing   | Same AWS account; staging-prod stack/tenant                                                                                                                                     |
| Operator hostname | **LOCKED (revised):** `https://producers-rice-mill.forgepublicsafety.com/` (flattened; nested `*.industrial.*` abandoned — ACM `*.forgepublicsafety.com` covers one label only) |
| Cognito roster    | **Full Producers Firebase Auth roster** before cutover                                                                                                                          |
| Storage → S3      | **All Producers Firebase Storage objects** before cutover                                                                                                                       |
| Day-1 modules     | Personnel, Equipment, LOTO, Sites/Areas, Documents, Training, Forms, Inspections, Incidents, QR Links, High-risk (CS/HW), Tasks, Messaging, Emergency Response                  |

**Still open (before Phase 5 / plant announce):**

| Open item                                    | Notes                                            |
| -------------------------------------------- | ------------------------------------------------ |
| Signed `APPROVE PRODUCERS AWS-PRIMARY PILOT` | **DONE** 2026-08-05 (Jeremy)                     |
| Production / staging tenant UUIDs            | **DONE** — see `tenant-ids.json` + auth record   |
| Staging-prod stack naming / CF aliases       | **DONE** — flat hostname dark to CF              |
| Named cutover window                         | Business + plant ops calendar — still open       |
| Support / rollback contacts                  | **DONE** (Jeremy primary; plant ops TBD Phase 5) |

Phase 1 checklist: [`57-producers-p2-phase1-prep.md`](57-producers-p2-phase1-prep.md) · Exit: [`58-producers-p2-phase1-exit.md`](58-producers-p2-phase1-exit.md).

## Current baseline (P1)

| Item                                    | State                                                                                                           |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Dev data load (Tenant A)                | DONE — see `54-producers-dev-load-complete.md`                                                                  |
| Dev Industrial UI/API against Aurora    | DONE — see `55-industrial-ui-module-deep-links.md`                                                              |
| Creator Cognito → Tenant A entitlements | DONE (dev only)                                                                                                 |
| Firebase production SoT                 | Unchanged                                                                                                       |
| Cognito Firebase Auth import            | **DONE** Phase 2 for Producers freeze roster (6) — see `60-producers-p2-phase2-exit.md`                         |
| Storage → S3 blobs                      | **DONE** staging (9077 objects / ~15.38 GiB reconciled); Aurora metadata **DONE** (9077 `AVAILABLE` on staging) |
| Production / staging-prod tenant        | **DONE** Phase 1 — see `58-producers-p2-phase1-exit.md`                                                         |

P1 smoke evidence: `evidence/wave3/api-smoke-tenant-a.json`, `browser-smoke-extra-modules.json`.

## Binding decisions before Phase 1

1. **Written authorization:** `APPROVE PRODUCERS AWS-PRIMARY PILOT` (template below) — **PENDING**.
2. Tenant designation → **LOCKED:** new dedicated production tenant.
3. Environment → **LOCKED:** staging-prod then production.
4. Operator set → **LOCKED:** full Producers Cognito roster.
5. File policy → **LOCKED:** all Producers Storage before cutover (AV engine decision still required at Phase 3 entry).

---

## Sequence overview

```text
0 Auth signature (decisions locked; signature pending)
1 Staging-prod tenant + infra → prod tenant twin
2 Cognito full Producers operator import
3 Storage → S3 (all Producers objects) + metadata repair
4 Final Producers data load + parity (staging, then prod)
5 QR resolver + Producers subdomain cutover
6 Pilot ops + Firebase fallback
7 Stabilize → IND-12/13 path (later)
```

Each phase has **entry criteria**, **work**, **exit criteria**. Do not skip exit criteria.

---

## Phase 0 — Authorization and design lock

**Entry:** P1 success criteria accepted by program owner.

| Work                                       | Owner                 | Notes                                                             |
| ------------------------------------------ | --------------------- | ----------------------------------------------------------------- |
| Sign P2 authorization record               | Program owner         | Fail-closed without signature — **PENDING**                       |
| Choose Producers production tenant ID/key  | Platform + Industrial | **LOCKED shape:** new dedicated tenant; UUID at provision         |
| Hostname strategy                          | Platform              | **LOCKED (revised):** `producers-rice-mill.forgepublicsafety.com` |
| Lock module allowlist for pilot day-1      | Industrial product    | **LOCKED** — see Phase 0 decisions table                          |
| Confirm out-of-scope domains stay Firebase | Product               | corrective actions, scan_*, WC satellites, etc.                   |
| Support + rollback contacts                | Ops                   | Names, escalation — **OPEN**                                      |

**Exit:** Signed auth record; tenant UUID assigned at provision kickoff; day-1 module allowlist published (**done**); contacts filled.

---

## Phase 1 — Production-like tenant and platform readiness

**Entry:** Phase 0 exit green (signature + contacts).

| Work                                            | Notes                                             |
| ----------------------------------------------- | ------------------------------------------------- |
| Provision staging-prod Producers tenant         | Same AWS account; not acceptance-A                |
| Provision production Producers tenant twin      | Same schema/flags pattern; empty until final load |
| Seed Industrial personas/roles on both tenants  | Mirror IND-3V industrial admin + operator roles   |
| Tenant feature flags ON (tenant override only)  | Global Industrial defaults stay OFF               |
| FORGE_INDUSTRIAL product + module entitlements  | Full locked day-1 allowlist                       |
| Cognito app client callbacks for subdomain URLs | Staging + prod aliases                            |
| CloudFront / DNS prep for subdomain             | Cert + alias ready; dark until Phase 5            |
| Cross-tenant negative smoke on industrial_*     | Security gate sample                              |

**Exit:** Both tenants exist; flags/entitlements green; `/auth/me` + industrial bootstrap succeed for a synthetic admin; subdomain DNS not live to users yet.

---

## Phase 2 — Cognito import for Producers operators

**Entry:** Phase 1 exit green; full operator roster export approved.

| Work                                                     | Notes                                                     |
| -------------------------------------------------------- | --------------------------------------------------------- |
| Read-only Firebase Auth export for Producers org         | No password hash migration                                |
| Map users → Cognito + Tenant membership + roles          | Email as join key; **full roster**                        |
| Bulk create Cognito users (temp password / force change) | Per `33-user-migration-plan.md`                           |
| Login smoke per role template                            | Admin, supervisor, operator (min) + sample of full roster |
| Comms: new subdomain URL + first-login password reset    | Before cutover window                                     |

**Exit:** 100% roster count match (or documented exceptions); each role template can sign in and reach entitled modules on AWS staging-prod.

**Fail-closed:** Do not disable Firebase Auth for Producers until Phase 5/6.

---

## Phase 3 — Storage → S3 and document usability

**Entry:** Phase 0 file decision signed; AV approach chosen (production scanner or time-boxed waiver).

| Work                                                        | Notes                                                 |
| ----------------------------------------------------------- | ----------------------------------------------------- |
| Inventory Firebase Storage objects for Producers            | Read-only census + checksums — **full Producers set** |
| Copy all Producers Storage objects → tenant-scoped S3 keys  | Per `32-file-migration-plan.md`                       |
| Update Aurora document metadata from PENDING_UPLOAD → ready | Soft keys + integrity fields                          |
| Presigned download path smoke                               | Equipment docs + LOTO attachments + certificates      |
| URL rewrite pass for known Firebase permanent URLs          | Where referenced in records                           |

**Exit:** Producers file set openable in AWS; object count/checksum sample pass; no permanent Firebase download tokens required for pilot paths.

---

## Phase 4 — Final Producers data load and parity

**Entry:** Phases 1–3 exit green.

| Work                                                          | Notes                                                          |
| ------------------------------------------------------------- | -------------------------------------------------------------- |
| Staging-prod full load + UAT                                  | Full locked module allowlist                                   |
| Maintenance notice + write-freeze window (Firebase Producers) | Short freeze preferred for production cut                      |
| Final delta extract → production Aurora Producers tenant      | Idempotent loaders; evidence pack                              |
| Row parity + RLS verify                                       | Sites, equipment, LOTO, personnel, day-1 modules               |
| QR token policy confirmation                                  | Dev load rotated tokens — remint / remap labels before Phase 5 |
| Operator UAT on staging-prod then production dark             | Full day-1 allowlist                                           |

**Exit:** Signed parity report; UAT checklist signed by Producers lead; freeze timeboxing accepted for cutover.

---

## Phase 5 — Producers-only traffic cutover

**Entry:** Phase 4 exit green; rollback drill completed (dry-run).

| Order | Action                                                                                                |
| ----- | ----------------------------------------------------------------------------------------------------- |
| 1     | Freeze Firebase writes for Producers (or maintain mode)                                               |
| 2     | Final micro-delta if needed                                                                           |
| 3     | Enable `producers-rice-mill.forgepublicsafety.com`                                                    |
| 4     | Make Cognito primary login for Producers operators                                                    |
| 5     | Enable QR public resolver on AWS for Producers tokens (blue/green + Firebase fallback)                |
| 6     | T+1h critical-path smoke: login → personnel → equipment → LOTO → forms/inspections sample → QR sample |

**Exit:** Producers plant ops running on AWS for locked allowlist; Firebase is fallback/read-oriented for Producers only; P0 = 0 at T+4h.

**Explicitly NOT done here:** DNS cutover for all Industrial tenants; Firebase Industrial decommission.

---

## Phase 6 — Pilot operations (first 14 days)

| Work                                                      | Cadence          |
| --------------------------------------------------------- | ---------------- |
| Error/latency/support watch                               | Daily            |
| Delta catch-up procedure if fallback reads needed         | As needed        |
| Defect triage (P0/P1 only for pilot)                      | Daily standup    |
| Decision: continue AWS-primary / roll back / extend pilot | Day 7 and Day 14 |

**Rollback triggers (any one):** auth outage > agreed SLA; data integrity P0; LOTO unusable; QR unresolved critical path; cross-tenant leak suspicion.

**Rollback action:** Re-enable Firebase as primary for Producers; park AWS tenant as read-only shadow; preserve Aurora for forensics.

---

## Phase 7 — After P2 (later, separate auth)

| Item                                                         | When                                                    |
| ------------------------------------------------------------ | ------------------------------------------------------- |
| Offline / scan sync                                          | IND-10 residual                                         |
| Production malware scanner                                   | Before broad _new_ document intake if waived in Phase 3 |
| Unmapped domains (corrective actions, scan_*, WC satellites) | Product backlog                                         |
| IND-12 readiness gate                                        | Before fleet cutover                                    |
| IND-13 full Industrial DNS/SoT cutover                       | Separate authorization                                  |

---

## Day-1 module allowlist (LOCKED)

| Included at cutover                                | Deferred / Firebase                           |
| -------------------------------------------------- | --------------------------------------------- |
| Personnel, Equipment, LOTO, Sites/Areas, Documents | Scan legacy                                   |
| Training, Forms, Inspections, Incidents            | Corrective actions                            |
| QR Links, Confined Space, Hot Work                 | WC satellites                                 |
| Tasks, Messaging, Emergency Response               | Analytics placeholders; unmapped certificates |

---

## Risks that will block go-live if ignored

| Risk                                       | Mitigation                                   |
| ------------------------------------------ | -------------------------------------------- |
| Operators still on acceptance tenant       | New production-bound tenant in Phase 1       |
| Full roster temp-password churn            | Comms + force-change UX rehearsal in staging |
| QR tokens rotated / Firebase URLs stale    | Remint/remap before Phase 5                  |
| Full Storage copy overrun                  | Early Phase 3 inventory + parallel copy      |
| Dual mental models (Firebase + AWS writes) | Single SoT after Phase 5; no dual-write      |
| Skipping security gate                     | Sample cross-tenant negatives in Phase 1     |

---

## Authorization template (copy to signed record)

```text
APPROVE PRODUCERS AWS-PRIMARY PILOT

Program: Forge Industrial Safety
Tenant: Producers Rice Mill (business-1782553339499)
Target AWS tenant: <UUID / tenant_key — NEW dedicated, not acceptance-A>
Environment path: staging-prod dress rehearsal then production
Hostname: https://producers-rice-mill.forgepublicsafety.com/
Day-1 modules: personnel, equipment, LOTO, sites/areas, documents, training,
  forms, inspections, incidents, QR links, confined space, hot work,
  tasks, messaging, emergency response
Cognito import: AUTHORIZED for FULL Producers Firebase Auth roster dated <date>
Storage → S3 copy: AUTHORIZED for ALL Producers Firebase Storage objects
Firebase SoT flip for Producers only: AUTHORIZED effective <window>
Full IND-13 fleet cutover: NOT AUTHORIZED
Dual-write: NOT AUTHORIZED

Signed: ________________  Date: ________
Role: Program Owner
```

## Evidence locations (to create during execution)

| Phase | Folder                                 |
| ----- | -------------------------------------- |
| 0     | `ind-11/evidence/p2/00-authorization/` |
| 1     | `ind-11/evidence/p2/01-tenant-infra/`  |
| 2     | `ind-11/evidence/p2/02-cognito/`       |
| 3     | `ind-11/evidence/p2/03-storage/`       |
| 4     | `ind-11/evidence/p2/04-parity/`        |
| 5–6   | `ind-11/evidence/p2/05-cutover/`       |

## Immediate next action

1. Phase 3 Storage exit is **GREEN** (`62`) — N4 URL rewrite deferred to Phase 4.
2. Phase 4 prep is ready (`63`) — sign `evidence/p2/04-parity/APPROVE-PRODUCERS-PHASE4-LOAD.md` before any staging domain reload.
3. Optional: prod-twin Aurora document metadata upsert (separate approval).

Phase 3 prep: [`61-producers-p2-phase3-prep.md`](61-producers-p2-phase3-prep.md).

## References

- `47-dec-ind-011-producers-coexistence.md`
- `54-producers-dev-load-complete.md`
- `55-industrial-ui-module-deep-links.md`
- `../32-file-migration-plan.md`
- `../33-user-migration-plan.md`
- `../34-cutover-strategy.md`
