# APPROVE PRODUCERS STORAGE → AURORA DOCUMENT METADATA (Phase 3 N-package)

**Status:** SIGNED — AUTHORIZED (staging tenant only)  
**Drafted:** 2026-08-06  
**Signed:** 2026-08-06  
**Governing docs:** DEC-IND-011 · `61-producers-p2-phase3-prep.md` · `APPROVE-PRODUCERS-STORAGE-COPY.md` · `av-approach-decision.md`

---

## Authorization requested

| Field | Value |
| --- | --- |
| Scope | Upsert `platform_documents` + `platform_document_versions` for Producers Storage objects already copied to S3 |
| Tenant | `producers-rice-mill-staging` · `0882c865-59c2-49a6-ab88-ce6ca89be30c` |
| Source map | `s3-map-staging-latest.json` (9077 keys; documentId/versionId deterministic) |
| Dest bucket | `forge-development-documents-511343547817-us-east-1` |
| Resulting availability | `AVAILABLE` |
| Scan status | `CLEAN` under Option B AV waiver (expires 2026-09-05) — recorded in metadata |
| Probe baseline | Staging had **0** document rows before N1/N2 |

## Explicitly NOT authorized

| Workstream | Status |
| --- | --- |
| Prod-twin (`producers-rice-mill`) metadata | NOT AUTHORIZED |
| Tenant A (`import-acceptance-tenant-a`) PENDING_UPLOAD flips | NOT AUTHORIZED here |
| Equipment-link rewrites / Firebase URL rewrite (N4) | Separate follow-on |
| Disable Firebase Storage | NOT AUTHORIZED |
| Presign smoke (N3) | Follow-on after this upsert |

## Preconditions

- [x] Staging S3 copy COMPLETE (9077 reconciled)  
- [x] AV Option B waiver on file  
- [x] Operator approved N-package for staging in Cursor (2026-08-06)  
- [x] This record signed by Program Owner  

## Signatures

| Role | Name | Signature | Date |
| --- | --- | --- | --- |
| Program Owner | Jeremy | APPROVED (electronic, Cursor session 2026-08-06 — N-package staging Aurora document metadata) | 2026-08-06 |

## Evidence destination

`docs/program/industrial-migration/ind-11/evidence/p2/03-storage/`
