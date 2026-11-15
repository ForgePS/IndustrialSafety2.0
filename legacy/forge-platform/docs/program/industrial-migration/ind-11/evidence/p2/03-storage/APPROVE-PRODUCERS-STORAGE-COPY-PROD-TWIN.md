# APPROVE PRODUCERS STORAGE COPY — PROD-TWIN REMOUNT (Phase 3 M4)

**Status:** SIGNED — AUTHORIZED (staging S3 → prod-twin S3 key remount)  
**Drafted:** 2026-08-06  
**Signed:** 2026-08-06  
**Governing docs:** DEC-IND-011 · `61-producers-p2-phase3-prep.md` · `APPROVE-PRODUCERS-STORAGE-COPY.md` · `av-approach-decision.md`

---

## Authorization requested

| Field | Value |
| --- | --- |
| Scope | Remount already-copied Producers objects from staging tenant keys → prod-twin tenant keys in the same documents bucket |
| Method | S3 server-side `CopyObject` (no Firebase re-download) |
| Source tenant | `producers-rice-mill-staging` · `0882c865-59c2-49a6-ab88-ce6ca89be30c` |
| Dest tenant | `producers-rice-mill` · `5da680d3-50f5-46ac-8b85-6cf454b6a0da` |
| Dest bucket | `forge-development-documents-511343547817-us-east-1` |
| Object count | 9077 (same freeze / staging map) |
| AV | Option B waiver still in force (`av-approach-decision.md` expires 2026-09-05) |

## Preconditions (met)

- [x] Staging copy COMPLETE + reconciled  
- [x] N1/N2 staging Aurora metadata COMPLETE  
- [x] N3 presign smoke PASS  
- [x] Operator selected M4 in Cursor (2026-08-06)

## Explicitly NOT authorized

| Workstream | Status |
| --- | --- |
| Prod-twin Aurora document metadata upsert | Separate approval (optional follow-on) |
| Firebase Storage disable / SoT flip | NOT AUTHORIZED |
| Fleet-wide remount | NOT AUTHORIZED |

## Signatures

| Role | Name | Signature | Date |
| --- | --- | --- | --- |
| Program Owner | Jeremy | APPROVED (electronic, Cursor session 2026-08-06 — begin Phase 3 M4 prod-twin remount) | 2026-08-06 |

## Evidence destination

`docs/program/industrial-migration/ind-11/evidence/p2/03-storage/`
