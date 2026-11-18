# APPROVE PRODUCERS AWS-PRIMARY PILOT

**Status:** SIGNED — AUTHORIZED  
**Drafted:** 2026-08-05  
**Signed:** 2026-08-05  
**Governing docs:** DEC-IND-011 · `56-producers-p2-execution-plan.md` · MD-1.0 · DD-IND-1.0

---

## Authorization

| Field | Value |
| --- | --- |
| Program | Forge Industrial Safety |
| Pilot tenant (Firebase) | Producers Rice Mill (`business-1782553339499`) |
| Target AWS tenant | Staging: `0882c865-59c2-49a6-ab88-ce6ca89be30c` (`producers-rice-mill-staging`); Production twin: `5da680d3-50f5-46ac-8b85-6cf454b6a0da` (`producers-rice-mill`) — **not** acceptance-A |
| Environment path | Staging-prod dress rehearsal, then production window |
| Staging landing | Same AWS account; staging-prod stack/tenant |
| Hostname | `https://producers-rice-mill.forgepublicsafety.com/` (flattened 2026-08-05; ACM wildcard compatibility) |
| Effective cutover window | TBD — fill before Phase 5 |

## Day-1 modules (AUTHORIZED)

Personnel · Equipment / Assets · Lockout/Tagout · Sites / Areas · Documents · Training · Forms · Inspections · Incidents · QR Links · Confined Space · Hot Work · Tasks · Messaging · Emergency Response

## Explicitly authorized work

| Workstream | Authorization |
| --- | --- |
| Cognito import | **AUTHORIZED** — full Producers Firebase Auth roster (temp password + force change) |
| Storage → S3 | **AUTHORIZED** — all Producers Firebase Storage objects + Aurora metadata repair |
| Firebase → AWS SoT flip | **AUTHORIZED for Producers only** effective at cutover window below |
| Production Aurora load for Producers | **AUTHORIZED** under Phase 4 freeze + parity gates in plan 56 |

## Explicitly NOT authorized

| Workstream | Status |
| --- | --- |
| Full IND-13 fleet Industrial cutover | NOT AUTHORIZED |
| True dual-write Firebase ↔ Aurora | NOT AUTHORIZED |
| Promote `import-acceptance-tenant-a` to production SoT | NOT AUTHORIZED |
| Casual apply of drafts 0028 / 0029 | NOT AUTHORIZED |
| Academy / RMS scope | NOT AUTHORIZED |

## Preconditions

- [x] This record signed by Program Owner  
- [x] Support and rollback contacts named (2026-08-05)  
- [ ] Cutover window agreed with Producers plant ops  

## Support and rollback contacts (D4)

| Role | Name / contact | Notes |
| --- | --- | --- |
| Program Owner / primary support | Jeremy | Day-to-day decision + coordinator during P2 |
| Rollback decision authority | Jeremy (Program Owner) | May delegate; default is Jeremy |
| On-call rollback operator | Operator on call / Jeremy | Execute DNS / SoT rollback commands when authorized |
| Producers plant ops contact | TBD before Phase 5 | Required before production announce |

## Signatures

| Role | Name | Signature | Date |
| --- | --- | --- | --- |
| Program Owner | Jeremy | APPROVED (electronic, Cursor session 2026-08-05) | 2026-08-05 |
| Industrial Product Lead (optional) | | | |
| Platform / Ops Lead (optional) | | | |

## Cutover window (fill before Phase 5)

| Field | Value |
| --- | --- |
| Staging UAT complete date | |
| Production freeze start (UTC) | |
| Production go-live (UTC) | |
| Rollback decision authority | Jeremy (Program Owner) unless delegated |

## References

- `docs/program/industrial-migration/ind-11/56-producers-p2-execution-plan.md`  
- `docs/program/industrial-migration/ind-11/47-dec-ind-011-producers-coexistence.md`  
- `docs/program/industrial-migration/32-file-migration-plan.md`  
- `docs/program/industrial-migration/33-user-migration-plan.md`  
- `docs/program/industrial-migration/34-cutover-strategy.md`  
