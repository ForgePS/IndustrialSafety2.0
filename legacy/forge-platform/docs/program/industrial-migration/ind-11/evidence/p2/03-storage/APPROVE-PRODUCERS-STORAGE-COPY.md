# APPROVE PRODUCERS STORAGE COPY (Phase 3)

**Status:** SIGNED — AUTHORIZED (staging Storage → S3 copy)  
**Drafted:** 2026-08-05  
**Signed:** 2026-08-06  
**Governing docs:** DEC-IND-011 · `61-producers-p2-phase3-prep.md` · `av-approach-decision.md` · inventory freeze under this folder

---

## Authorization requested

| Field | Value |
| --- | --- |
| Scope | Copy Producers Rice Mill Firebase Storage objects → Forge S3 (staging first) |
| Source | `forge-industrial-safety.firebasestorage.app` · `business-1782553339499` |
| Inventory freeze | `storage-inventory-2026-08-06T01-06-44-696Z.json` (9077 objects / ~15.38 GiB) |
| Dest tenant (staging) | `producers-rice-mill-staging` · `0882c865-59c2-49a6-ab88-ce6ca89be30c` |
| AV | Time-boxed waiver Option B (`av-approach-decision.md`) expires 2026-09-05 |

## Explicitly NOT authorized by this record

| Workstream | Status |
| --- | --- |
| Prod-twin copy (until staging green) | NOT AUTHORIZED here until separately noted |
| Aurora metadata mutation / URL rewrite | Separate N-package approval or extend this after staging green |
| Disable Firebase Storage | NOT AUTHORIZED |
| Fleet-wide (non-Producers) | NOT AUTHORIZED |

## Preconditions

- [x] Inventory freeze complete and reviewed  
- [x] AV approach recorded (waiver)  
- [x] This record signed by Program Owner  
- [x] Operator confirms **“begin Phase 3 Storage copy staging”**  

## Signatures

| Role | Name | Signature | Date |
| --- | --- | --- | --- |
| Program Owner | Jeremy | APPROVED (electronic, Cursor session 2026-08-06 — begin Phase 3 Storage copy staging) | 2026-08-06 |
| Platform / Ops Lead (optional) | | | |

## Evidence destination

`docs/program/industrial-migration/ind-11/evidence/p2/03-storage/`
