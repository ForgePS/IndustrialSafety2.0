# Producers P2 — Phase 3 Exit (Storage → S3)

**Date:** 2026-08-06  
**Status:** **EXIT GREEN** (with deferred N4 — see gaps)  
**Authority:** Storage inventory / copy / Aurora metadata / prod-twin remount approvals under `evidence/p2/03-storage/`  
**Phase 2 exit:** [`60-producers-p2-phase2-exit.md`](60-producers-p2-phase2-exit.md) **GREEN**  
**Prep:** [`61-producers-p2-phase3-prep.md`](61-producers-p2-phase3-prep.md)  
**Plan:** [`56-producers-p2-execution-plan.md`](56-producers-p2-execution-plan.md)

---

## Exit criteria vs result

| Criterion (plan 56)                                         | Result                                                                                                 |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Inventory Firebase Storage objects for Producers            | **PASS** — freeze 9077 objects / 16 516 836 986 bytes (`truncated: false`)                             |
| Copy all Producers Storage objects → tenant-scoped S3 keys  | **PASS** — staging copy + reconciled; prod-twin remount + reconciled                                   |
| Update Aurora document metadata from PENDING_UPLOAD → ready | **PASS** — staging `platform_documents` / `platform_document_versions` 9077 `AVAILABLE`                |
| Presigned download path smoke                               | **PASS** — certificate / equipment / LOTO (3/3 HTTP 200 + size match)                                  |
| URL rewrite pass for known Firebase permanent URLs          | **DEFERRED** — N4 carried to Phase 4 (domain rows mostly still on Tenant A; staging needs parity load) |
| Firebase Storage remains production SoT                     | **PASS** — fail-closed held (no disable / announce)                                                    |

---

## Freeze + copy summary

| Metric              | Value                                                                  |
| ------------------- | ---------------------------------------------------------------------- |
| Source bucket       | `forge-industrial-safety.firebasestorage.app`                          |
| Firebase business   | `business-1782553339499`                                               |
| Inventory matched   | **9077**                                                               |
| Staging tenant      | `producers-rice-mill-staging` · `0882c865-59c2-49a6-ab88-ce6ca89be30c` |
| Prod-twin tenant    | `producers-rice-mill` · `5da680d3-50f5-46ac-8b85-6cf454b6a0da`         |
| Dest bucket         | `forge-development-documents-511343547817-us-east-1`                   |
| Staging copy        | 9074 copied + 3 skipped, 0 errors                                      |
| Staging reconcile   | 9077 objects / 16 516 836 986 bytes                                    |
| Staging Aurora docs | 9077 documents / 9077 versions `AVAILABLE`                             |
| Prod-twin remount   | 9057 copied + 20 skipped, 0 errors                                     |
| Prod-twin reconcile | 9077 objects / 16 516 836 986 bytes                                    |
| AV                  | Option B waiver to **2026-09-05**                                      |

---

## Evidence index

| Gate                          | Evidence                                                                            |
| ----------------------------- | ----------------------------------------------------------------------------------- |
| Inventory approve             | `APPROVE-PRODUCERS-STORAGE-INVENTORY.md`                                            |
| AV decision                   | `av-approach-decision.md`                                                           |
| Freeze                        | `storage-inventory-2026-08-06T01-06-44-696Z.json`, `storage-inventory-summary.json` |
| Staging map                   | `s3-map-staging-latest.json`, `s3-map-staging-summary.json`                         |
| Staging copy approve          | `APPROVE-PRODUCERS-STORAGE-COPY.md`                                                 |
| Staging copy + reconcile      | `s3-copy-staging-result.json`, `s3-copy-staging-reconcile.json`                     |
| Aurora metadata approve       | `APPROVE-PRODUCERS-STORAGE-AURORA-METADATA.md`                                      |
| Aurora metadata result        | `aurora-document-metadata-result.json`                                              |
| Presign smoke                 | `presign-smoke.json`                                                                |
| Prod-twin map                 | `s3-map-prod-twin-latest.json`                                                      |
| Prod-twin remount approve     | `APPROVE-PRODUCERS-STORAGE-COPY-PROD-TWIN.md`                                       |
| Prod-twin remount + reconcile | `s3-remount-prod-twin-result.json`, `s3-remount-prod-twin-reconcile.json`           |
| Index                         | `evidence/p2/03-storage/INDEX.md`                                                   |

---

## Known gaps (acceptable for Phase 3 exit)

| Gap                                                                  | Disposition                                                                                                                    |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| N4 Firebase permanent URL rewrite in domain records                  | **Deferred to Phase 4** — requires staging domain data load / parity; bytes + staging platform docs already usable via S3 keys |
| Prod-twin Aurora `platform_documents` upsert                         | Optional soft — S3 keys present; metadata mirror of N1/N2 not required for Phase 3 exit                                        |
| IND-9 `platform_documents` schema not in repo migrations on this tip | Live Aurora has tables (probe + N1/N2); carry schema re-commit / migration hygiene separately                                  |
| Production malware scanner not online                                | Option B waiver expires 2026-09-05; sample re-scan still committed                                                             |
| Platform Documents UI/API delivery not re-smoked via hosted App      | Direct S3 presign + Aurora status accepted for N3 (API module not on this branch tip)                                          |

---

## Phase 4 entry

Phase 4 (**final Producers data load and parity**) may start when:

1. This Phase 3 exit remains green
2. Phase 4 prep reviewed (`63-producers-p2-phase4-prep.md`)
3. `APPROVE-PRODUCERS-PHASE4-LOAD.md` signed
4. Operator confirms **“begin Phase 4 staging load”**

**Fail-closed:** Do not disable Firebase Storage, announce hostname as production, or flip SoT until Phase 5/6.

---

## Explicit non-entry

- Phase 5 DNS announce / SoT flip
- Firebase Storage disable
- IND-13 fleet Storage migration
- Treating `import-acceptance-tenant-a` as Producers production SoT
