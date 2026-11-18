# Import Platform S8 — Batch Sizing

**Document:** `docs/testing/import-platform-s8-batch-sizing.md`  
**Date:** 2026-07-30  
**Status:** **VERIFIED** for the bounded 50-vs-200 Aurora comparison; keep the default at 50

## Recommendation (`S8_BATCH_RECOMMENDATION`)

| Parameter         | Value   |
| ----------------- | ------- |
| Default           | **50**  |
| Minimum           | 1       |
| Maximum           | **500** |
| Recommended range | 50–250  |

Rationale (code): balance Aurora transaction duration, lock hold time, and retry granularity; cap oversized transactions under concurrent tenants.

## Evidence

| Evidence                            | Status                                                          |
| ----------------------------------- | --------------------------------------------------------------- |
| Unit asserts default 50 / max 500   | **VERIFIED** (`s8-hardening.unit.test.ts`)                      |
| 500 rows / batch 50 on Aurora       | **VERIFIED** — COMPLETED, 500/500 successful, worker 11,718 ms  |
| 500 rows / batch 200 on Aurora      | **VERIFIED** — COMPLETED, 500/500 successful, worker 10,216 ms  |
| Comparative runs at 100 / 250 / 500 | **NOT_VERIFIED** — not required for this bounded closeout smoke |
| Raise max above 500                 | **Not authorized** without controlled study                     |

Evidence: `docs/testing/evidence/import-platform/s8-batch-size-live.json`.

## Guidance

Tune `batchSize` per execute request within min/max. Keep default **50**: batch 200 was 1,502 ms faster in one small-job sample, but one sample is not enough to change the default. Do not raise the maximum above 500.

## Related

- Gap GAP-052
- LIM-IMP-003
