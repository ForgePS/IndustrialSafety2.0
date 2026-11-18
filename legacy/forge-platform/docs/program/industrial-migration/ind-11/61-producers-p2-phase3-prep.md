# Producers P2 — Phase 3 Prep Checklist (Storage → S3)

**Date:** 2026-08-05  
**Status:** **EXIT GREEN** (`62-producers-p2-phase3-exit.md`) — N4 URL rewrite deferred to Phase 4  
**Phase 2 exit:** [`60-producers-p2-phase2-exit.md`](60-producers-p2-phase2-exit.md) **GREEN**  
**Phase 3 exit:** [`62-producers-p2-phase3-exit.md`](62-producers-p2-phase3-exit.md) **GREEN**  
**Plan:** [`56-producers-p2-execution-plan.md`](56-producers-p2-execution-plan.md)  
**Foundational plan:** [`../32-file-migration-plan.md`](../32-file-migration-plan.md)  
**Freeze:** `evidence/p2/03-storage/storage-inventory-2026-08-06T01-06-44-696Z.json`  
**Copy:** `evidence/p2/03-storage/s3-copy-staging-result.json` · reconcile `s3-copy-staging-reconcile.json`  
**Metadata:** `evidence/p2/03-storage/aurora-document-metadata-result.json` (9077 AVAILABLE)  
**Presign:** `evidence/p2/03-storage/presign-smoke.json`  
**Prod-twin remount:** `evidence/p2/03-storage/s3-remount-prod-twin-result.json` · reconcile `s3-remount-prod-twin-reconcile.json`

## Locked targets

| Item              | Value                                                                      |
| ----------------- | -------------------------------------------------------------------------- |
| Firebase project  | `forge-industrial-safety`                                                  |
| Firebase business | `business-1782553339499`                                                   |
| Staging tenant    | `producers-rice-mill-staging` · `0882c865-59c2-49a6-ab88-ce6ca89be30c`     |
| Prod twin tenant  | `producers-rice-mill` · `5da680d3-50f5-46ac-8b85-6cf454b6a0da`             |
| Scope             | **All** Producers Firebase Storage objects (pilot auth already AUTHORIZED) |
| S3 key convention | `tenants/{tenantId}/documents/{documentId}/{versionId}/{filename}`         |
| Aurora docs today | Many `PENDING_UPLOAD` / path-only placeholders (dev load)                  |

**Do not** copy onto `import-acceptance-tenant-a` as production SoT.

---

## Phase 3 work packages

### K. Authorization / AV gate

| #   | Task                                                            | Status                                                                      |
| --- | --------------------------------------------------------------- | --------------------------------------------------------------------------- |
| K1  | Phase 2 exit remains green                                      | **DONE** (`60`)                                                             |
| K2  | Pilot auth already authorizes Storage→S3 for Producers          | **DONE** (Phase 0 signed)                                                   |
| K3  | Choose AV approach: production scanner **or** time-boxed waiver | **DONE** — Option B waiver → `av-approach-decision.md` (expires 2026-09-05) |
| K4  | Sign read-only Storage inventory approval                       | **DONE** — `APPROVE-PRODUCERS-STORAGE-INVENTORY.md`                         |
| K5  | Sign S3 copy approval (staging first) after inventory freeze    | **DONE** — `APPROVE-PRODUCERS-STORAGE-COPY.md`                              |

### L. Read-only Storage inventory

| #   | Task                                                                                | Status                                                                  |
| --- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| L1  | Tooling: list Producers-scoped Storage objects (path prefixes / metadata rules)     | **DONE** — `scripts/ind11b-p2-run-storage-inventory.mjs`                |
| L2  | Capture object path, size, contentType, md5/crc, updated time                       | **DONE**                                                                |
| L3  | Classify categories (LOTO, equipment, certificates, general docs, QR images, other) | **DONE** — see freeze summary                                           |
| L4  | Produce freeze `storage-inventory-<date>.json` + count/size summary                 | **DONE** — 9077 objects / 16 516 836 986 bytes; `truncated: false`      |
| L5  | Exception list: zero-byte, missing contentType, orphan paths, unscoped objects      | **DONE** — 0 / 0 / 0 / 0 Producers exceptions; 15 non-Producers skipped |

### M. S3 copy (staging first)

| #   | Task                                                                                           | Status                                                                                 |
| --- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| M1  | Dry-run key map Storage path → S3 key for prod-twin **or** staging tenant                      | **DONE** — staging map, 9077 unique keys, 0 collisions (`s3-map-staging-summary.json`) |
| M2  | Parallel copy with checksum verify (staging bucket / prefix)                                   | **DONE** — 9074 copied + 3 skipped, 0 errors (~13.4 min, concurrency 10)               |
| M3  | Object count + sample checksum reconciliation                                                  | **DONE** — S3 list 9077 objects / 16 516 836 986 bytes = inventory                     |
| M4  | Repeat to prod-twin prefix after staging green (or single shared prefix policy — decide in M1) | **DONE** — S3 CopyObject remount 9057 copied + 20 skipped, reconcile 9077/9077         |

### N. Aurora metadata + download path

| #   | Task                                                                     | Status                                                              |
| --- | ------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| N1  | Map inventory rows → `platform_documents` / `platform_document_versions` | **DONE** — staging upsert from S3 map                               |
| N2  | Flip / set versions to ready with S3 key + integrity fields              | **DONE** — 9077 `AVAILABLE` / `CLEAN` (AV waiver noted in metadata) |
| N3  | Presigned download smoke: equipment doc, LOTO attachment, certificate    | **DONE** — `presign-smoke.json` (3/3 HTTP 200 + AVAILABLE)          |
| N4  | URL rewrite pass for known Firebase permanent URLs in records            | **DEFERRED** — Phase 4 (see `62` exit gaps)                         |

### O. Evidence

| #   | Task                                    | Status                                                                        |
| --- | --------------------------------------- | ----------------------------------------------------------------------------- |
| O1  | Folder `evidence/p2/03-storage/`        | **DONE** (scaffold)                                                           |
| O2  | Inventory + copy + metadata result JSON | Inventory + staging copy + Aurora metadata **DONE**                           |
| O3  | Phase 3 exit note                       | **DONE** — [`62-producers-p2-phase3-exit.md`](62-producers-p2-phase3-exit.md) |

---

## AV decision (required before copy)

| Option                 | When to use                                                             |
| ---------------------- | ----------------------------------------------------------------------- |
| A — Production scanner | Preferred if GuardDuty Malware Protection / clam / vendor path is ready |
| B — Time-boxed waiver  | Allowed for pilot with written expire date + sample re-scan commitment  |

**Decision:** **B — Time-boxed waiver** recorded in `evidence/p2/03-storage/av-approach-decision.md` (expires **2026-09-05**). Hard gate for copy only.

---

## Script sketch (not executed in this prep)

```text
scripts/ind11b-p2-storage-inventory-plan.mjs     # refuse without FORGE_P2_STORAGE_INVENTORY_AUTHORIZED
scripts/ind11b-p2-run-storage-inventory.mjs      # RO live list + checksum census
scripts/ind11b-p2-storage-s3-map.mjs             # dry-run key map
scripts/ind11b-p2-run-storage-s3-copy-staging.mjs
scripts/ind11b-p2-storage-presign-smoke.mjs
```

Gates (fail-closed):

- `FORGE_P2_STORAGE_INVENTORY_AUTHORIZED=true` only after K4 signed
- `FORGE_P2_STORAGE_COPY_AUTHORIZED=true` only after K3 + K5
- Default = dry-run / refuse live

---

## Explicit non-goals for Phase 3

- No Firebase Auth disable / SoT flip (Phase 5)
- No full Aurora transactional reload (Phase 4)
- No IND-13 fleet Storage migration
- No announcing hostname as production

---

## Ready-to-execute criteria

Phase 3 **inventory** entry criteria were met; freeze is complete (`truncated: false`).

Phase 3 **copy** may start when:

1. K3 AV decision on file (**DONE** — waiver to 2026-09-05)
2. `APPROVE-PRODUCERS-STORAGE-COPY.md` signed
3. Operator confirms **“begin Phase 3 Storage copy staging”**

---

## Inventory freeze result (2026-08-06)

| Metric                                                      | Value                                         |
| ----------------------------------------------------------- | --------------------------------------------- |
| Bucket                                                      | `forge-industrial-safety.firebasestorage.app` |
| Scanned                                                     | 9092                                          |
| Producers matched                                           | **9077**                                      |
| Bytes                                                       | **16 516 836 986** (~15.38 GiB)               |
| Non-Producers skipped                                       | 15                                            |
| LOTO / equipment / DOT / module / certs / other             | 5395 / 2985 / 602 / 92 / 1 / 2                |
| Exceptions (0-byte / no contentType / no checksum / orphan) | 0 / 0 / 0 / 0                                 |

Scripts: `ind11b-p2-storage-inventory-plan.mjs`, `ind11b-p2-run-storage-inventory.mjs`

## Immediate next actions

1. Begin Phase 4 prep / load window when authorized.
2. Include N4 Firebase URL rewrite with staging domain parity load.
3. Optional: upsert prod-twin `platform_documents` metadata (separate approval).

## References

- Files: `../32-file-migration-plan.md`
- Pilot auth: `evidence/p2/00-authorization/APPROVE-PRODUCERS-AWS-PRIMARY-PILOT.md`
- Dev load note: `54-producers-dev-load-complete.md` (PENDING_UPLOAD placeholders)
