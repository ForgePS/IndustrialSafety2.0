# Configuration Platform performance report

**Date:** 2026-07-28  
**Evidence:** `docs/testing/evidence/config-final-acceptance/step9-perf.json`  
**Method:** 8 sequential samples via CloudFront → API (client-side wall clock)

| Operation                        | p50 (ms) | p95 (ms) | p99 (ms) | Error rate |
| -------------------------------- | -------- | -------- | -------- | ---------- |
| catalog                          | 166      | 215      | 215      | 0          |
| configuration list (terminology) | 141      | 167      | 167      | 0          |
| effective-version                | 180      | 371      | 371      | 0          |

## Not measured (limitations)

- publish / schedule / rollback latency series
- large dropdown / form / workflow JSON
- Tenant Admin / Creator / RMS startup
- database query count
- cache hit rate
- SQL-level N+1

**Verdict:** PASS smoke; ACCEPTED_WITH_LIMITATIONS for full directive matrix.
