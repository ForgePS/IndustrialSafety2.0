# Import Platform S8 — Performance

**Document:** `docs/testing/import-platform-s8-performance.md`  
**Date:** 2026-07-30  
**Status:** **PARTIAL** — live Aurora measurements now cover 500 and 5,000 rows; 25k+ remains unverified.
**Honesty rule:** Do **not** invent 25k / 100k / 250k passes.

## Deployed environment

| Item   | Value                                              |
| ------ | -------------------------------------------------- |
| Aurora | aurora-postgresql serverless writer                |
| Worker | CPU 256 / memory 512 (TD `:26`, desired count 1)   |
| API    | TD `:42`                                           |
| Path   | Authenticated API → S3 → SQS → ECS worker → Aurora |

## Executed live evidence

| Test                 | Batch | Result                                                                              |
| -------------------- | ----- | ----------------------------------------------------------------------------------- |
| 500 synthetic rows   | 50    | **COMPLETED** — worker 11,718 ms; workflow wall 21,994 ms; 500/500 successful       |
| 5,000 synthetic rows | 50    | **COMPLETED** — worker 115,881 ms; workflow wall 165,291 ms; 5,000/5,000 successful |

Evidence: `docs/testing/evidence/import-platform/s8-aurora-perf-matrix.json`.

The stable measurement window reached **99.89% worker CPU** and **100% Aurora CPU**. Worker memory peaked at **16.70%** and Aurora connections peaked at **9**. This is a bounded smoke, not a safe-capacity claim.

One earlier 500-row run was excluded because revision `:25` was still draining during deployment overlap. It remains stuck at 99% after processing 250 rows; the accepted matrix above was repeated after the service stabilized on `:26`.

## S8 batch recommendation (code)

| Parameter         | Value   |
| ----------------- | ------- |
| Default           | **50**  |
| Minimum           | 1       |
| Maximum           | **500** |
| Recommended range | 50–250  |

## Aurora multi-size matrix

| Size (rows) | Tenants | Batch  | Env                | Status                               |
| ----------- | ------- | ------ | ------------------ | ------------------------------------ |
| 500         | 1       | 50     | Aurora development | **VERIFIED**                         |
| 5,000       | 1       | 50     | Aurora development | **VERIFIED**                         |
| 5,000       | 3       | 50     | Aurora development | **NOT_VERIFIED**                     |
| 25,000      | 1       | 50–250 | Aurora development | **NOT_VERIFIED**                     |
| 50,000      | 1       | 50–250 | Aurora development | **NOT_VERIFIED**                     |
| 100_000     | 1       | 50–250 | Aurora non-prod    | **NOT_VERIFIED** — do not claim pass |
| 250_000     | 1+      | TBD    | Aurora non-prod    | **NOT_VERIFIED** — do not claim pass |

### Remaining protocol

1. Repeat at 25k and 100k only in a scheduled non-production load window.
2. Record queue age, DLQ, Aurora lock waits, and ACU scaling alongside CPU/connections.
3. Define stop thresholds because the 5k smoke already reached CPU saturation.
4. Confirm journal idempotency on redelivery sample.
5. Attach artifacts under `docs/testing/evidence/import-platform/`.

## Queue / worker baselines (config — not throughput guarantees)

| Setting            | Value         |
| ------------------ | ------------- |
| Visibility timeout | 300 s         |
| maxReceiveCount    | 3             |
| Backlog alarm      | ≥ 100 visible |

## Related

- LIM-IMP-003 (OPEN)
- `docs/testing/import-platform-s8-batch-sizing.md`
- `docs/testing/import-platform-s8-concurrency.md`

## Adjacent defects

- **DEF-S8-017 — PARTIAL.** The imports DLQ currently has four visible messages, and `forge-development-alarm-importsdlq` transitioned from OK to ALARM on a depth datapoint of 1. No additional poison message was introduced, and no message bodies were read. Queue-age/backlog transitions remain untested. Evidence: `s8-alarm-live.json`.
- **DEF-S8-018 — NOT_VERIFIED.** PITR/clone restore was not attempted because it is invasive and outside this bounded performance pass. Procedure: `docs/operations/import-backup-restore.md`.
