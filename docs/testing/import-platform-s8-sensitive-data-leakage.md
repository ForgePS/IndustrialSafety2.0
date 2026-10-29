# Import Platform S8 — Sensitive Data Leakage

**Document:** `docs/testing/import-platform-s8-sensitive-data-leakage.md`  
**Date:** 2026-07-30  
**Status:** **NOT_VERIFIED** for live canary hunt

## Objectives

Confirm synthetic canaries and secrets do not appear in API payloads, CloudWatch logs, queue tooling output, or browser persistence.

## Canaries (synthetic)

- `S8-TEST-SSN-999-88-7777`
- `S8-TEST-FEMA-123456`
- `S8-TEST-CREDENTIAL-DO-NOT-EXPOSE`
- `S8-TEST-BANK-00001111`
- `S8-TEST-MEDICAL-CANARY`

## Controls verified by design / unit

| Control                                                                 | Status                                                      |
| ----------------------------------------------------------------------- | ----------------------------------------------------------- |
| Masking helpers / classification (S6 lineage)                           | Unit / design **VERIFIED**                                  |
| DLQ ops does not print message Body                                     | Script design **VERIFIED** (`import-dlq-ops.mjs` redaction) |
| Privileged download requires `import.sensitive`; secrets still withheld | Design / OpenAPI; live matrix **NOT_VERIFIED**              |

## Live evidence

| Hunt                                               | Status                                                                |
| -------------------------------------------------- | --------------------------------------------------------------------- |
| CloudWatch log Insights canary search (API/worker) | **NOT_VERIFIED**                                                      |
| API response body canary search                    | **NOT_VERIFIED**                                                      |
| Browser persistence canary search                  | Suite added; run **NOT_VERIFIED** (`s8-playwright-import-center.log`) |
| S3 object key / metadata canary                    | **NOT_VERIFIED**                                                      |

## Related

- LIM-IMP-007, LIM-IMP-013, LIM-IMP-014
- Gap GAP-033 / DEF-S8-008
