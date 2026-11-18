# DEC-IND-011 — Producers coexistence (practical path)

**Date:** 2026-08-04  
**Status:** ACCEPTED (program owner direction)  
**Authority:** MD-1.0, DD-IND-1.0; supplements IND-11 sequencing  
**Product:** Forge Industrial Safety  
**Tenant focus:** Producers Rice Mill (`business-1782553339499`)

## Decision

Pursue a **practical path** to AWS exposure for Producers **without** IND-13 full cutover:

| Phase     | Model                          | Firebase                 | AWS                               | Authorization posture                                                          |
| --------- | ------------------------------ | ------------------------ | --------------------------------- | ------------------------------------------------------------------------------ |
| **P1**    | AWS pilot / Firebase SoT       | Writable SoT             | Shadow / validation (dev→staging) | Development writes OK under IND-11B gates; **no** production Aurora SoT flip   |
| **P2**    | AWS primary for Producers only | Fallback / read-oriented | Day-to-day ops for Producers      | Requires **separate written auth** (prod tenant, Cognito, files, tenant flags) |
| **Later** | IND-13 cutover                 | Decommission schedule    | SoT for all Industrial            | Fail-closed until IND-12 gates green                                           |

**Rejected for now:** true dual-write (mutual writable sync). Too high conflict/audit risk.

## Binding identity map (wave-1)

| Firebase org                                   | AWS tenant (current)                                                  | Role                           |
| ---------------------------------------------- | --------------------------------------------------------------------- | ------------------------------ |
| `business-1782553339499` (Producers Rice Mill) | `019faa15-e558-70b6-adcd-a510c3c995f4` (`import-acceptance-tenant-a`) | P1 target                      |
| `business-forge-default`                       | `019faa15-e578-76bd-b269-038d23c03b5e` (`import-acceptance-tenant-b`) | Control / non-Producers sample |

P2 may promote Producers to a **dedicated production-bound tenant** (not acceptance) — decision deferred until P1 acceptance criteria pass.

## Write / read rules (P1)

| Surface                                 | Authority                                                                                                 |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Firebase Industrial app                 | **SoT for all production writes**                                                                         |
| AWS Industrial (`industrial-web` + API) | Validation, UX, reporting against imported snapshot; treat as **non-authoritative**                       |
| Freshness                               | Periodic re-extract / NONPRODUCTION_LOAD refresh into development (and later staging) under IND-11B flags |
| Cognito                                 | Dev/acceptance personas only in P1 — **no** production Firebase Auth→Cognito import until P2 auth         |
| Storage / files                         | Firebase remains; no Storage→S3 until authorized                                                          |
| Feature flags                           | Prefer **tenant override ON** for Producers acceptance tenant only; global Industrial flags stay OFF      |

## P1 success criteria

1. Producers wave-1 domains reloadable idempotently into development Aurora (`errorCount=0`).
2. Post-load RLS verify remains green for tenant A/B.
3. Operator can sign into Industrial on AWS (dev/staging) as acceptance persona and exercise sites → equipment → LOTO read path for Producers-mapped data.
4. Documented “do not write authoritative changes in AWS” operator note.
5. Delta refresh procedure recorded (script + evidence folder).

## P2 entry gates (not started)

- Uncapped / remaining domain load plan for Producers org
- Cognito user import for Producers operators
- Storage/AV decision for file-dependent workflows
- Production (or staging-prod-like) tenant designation
- Tenant-scoped flags + support runbook
- Explicit **APPROVE PRODUCERS AWS-PRIMARY PILOT** authorization record

Sequenced execution plan (draft, unauthorized until signed): [`56-producers-p2-execution-plan.md`](56-producers-p2-execution-plan.md).

## Explicitly still fail-closed

- Production Aurora load as SoT
- Full IND-13 cutover / DNS flip for all tenants
- True dual-write sync
- RMS / Academy
- Casual apply of drafts **0028 / 0029**

## Immediate next actions (P1)

1. Raise Producers-focused data refresh cadence (sites/areas uncapped; raise equipment/LOTO caps or Producers-filtered extract).
2. Wire acceptance tenant A Industrial flags ON (tenant override only).
3. Smoke checklist for persona login → LOTO/equipment read on CloudFront Industrial.
4. Draft P2 authorization template (blank until P1 done).

## References

- Tenant map: `ind-11/evidence/wave1/tenant-mapping.json`
- Load evidence: `ind-11/evidence/wave1/nonproduction-load-counts.json`
- Verify: `ind-11/evidence/wave1/postload-verify-counts.json`
- Cutover strategy (later): `34-cutover-strategy.md`
