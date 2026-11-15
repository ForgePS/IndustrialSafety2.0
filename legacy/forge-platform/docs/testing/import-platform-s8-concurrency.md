# Import Platform S8 — Concurrency

**Document:** `docs/testing/import-platform-s8-concurrency.md`  
**Date:** 2026-07-30  
**Status:** **PARTIAL** — three live jobs completed across two seeded tenants; safe maximum remains unverified

## Deployed worker capacity (config)

| Item                | Value                                    |
| ------------------- | ---------------------------------------- |
| Worker CPU / memory | 256 / 512                                |
| Path                | SQS → ECS (`RETAIN_SQS_ECS_WORKER_PATH`) |
| Aurora              | serverless writer                        |

The live run used worker TD `:26` and API TD `:42`.

## Live measured run

| Scenario                                | Result                                                                                           |
| --------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Concurrent jobs same tenant             | **VERIFIED** — two 200-row jobs completed, 200/200 successful each                               |
| Concurrent jobs across tenants          | **PARTIAL** — three jobs across two tenants completed; the supplied fixture has only two tenants |
| Cross-tenant status access              | **VERIFIED** — all three other-tenant probes returned 404 with no job data                       |
| Parallel execution wall time            | 13,202 ms for all three jobs to reach terminal status                                            |
| Worker durations                        | 7,032 ms; 7,025 ms; 4,031 ms                                                                     |
| Lock contention / connection saturation | **NOT_VERIFIED** — lock waits were not captured; Aurora connections peaked at 9                  |
| Safe max in-flight jobs                 | **NOT_VERIFIED** — freeze lists as placeholder                                                   |

All 600 synthetic rows completed without row errors. Shared performance telemetry reached worker and Aurora CPU saturation, so this smoke does not establish a production concurrency limit.

Evidence: `docs/testing/evidence/import-platform/s8-concurrency-live.json`.

## Freeze honesty

`Supported concurrency limits` in `import-platform-freeze.md` remain **NOT_VERIFIED**.

## Related

- Gap GAP-051 / DEF-S8-016
- Performance protocol: `docs/testing/import-platform-s8-performance.md`
