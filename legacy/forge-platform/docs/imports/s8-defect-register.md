# Import Platform S8 — Defect Register (Functional Patch Pass)

**Document:** `docs/imports/s8-defect-register.md`  
**Updated:** 2026-07-30 (final evidence pass — patch baseline)  
**Rules:** P0/P1 must be 0 for `READY_FOR_REVIEW`.  
**Deployed patch baseline:** tag `import-s8-patch-20260730113557` / API `:42` / worker `:26` / migration `0027`  
**Rollback targets:** API `:40` / worker `:25` (rehearsal executed; forward restored)  
**Static consoles:** rebuilt with `NEXT_PUBLIC_API_URL=https://d108fstxdv69bo.cloudfront.net`

## Closed this pass (functional + evidence)

| ID             | Sev | Title                                                        | Status     | Evidence                                                    |
| -------------- | --- | ------------------------------------------------------------ | ---------- | ----------------------------------------------------------- |
| **DEF-S8-023** | P1  | Clean malware verdict does not auto-trigger format detection | **CLOSED** | `s8-authenticated-workflow-no-replay.json`, `DEF-S8-023.md` |
| **DEF-S8-024** | P1  | Default execution adapter missing/wrong in deployed API      | **CLOSED** | `s8-def-023-024-closed.json`, API `:42`                     |
| **DEF-S8-001** | P1  | Rollback rehearsal                                           | **CLOSED** | `s8-rollback-rehearsal.json`                                |
| **DEF-S8-010** | P1  | Worker crash recovery                                        | **CLOSED** | `s8-worker-crash-recovery.json`                             |
| **DEF-S8-011** | P1  | Duplicate delivery idempotency                               | **CLOSED** | `s8-queue-idempotency-live.json`                            |
| **DEF-S8-013** | P1  | Stale-lock recovery                                          | **CLOSED** | `s8-stale-lock-recovery.json`                               |
| **DEF-S8-019** | P1  | Cancellation recovery                                        | **CLOSED** | `s8-cancel-recovery.json`                                   |
| **DEF-S8-020** | P1  | Batch-size evidence                                          | **CLOSED** | `s8-batch-size-live.json`                                   |

## Remaining open P1

| ID         | Sev | Title                                     | Status      | Notes                                                                  |
| ---------- | --- | ----------------------------------------- | ----------- | ---------------------------------------------------------------------- |
| DEF-S8-002 | P1  | Full authenticated browser create→execute | **OPEN**    | Dashboard Playwright 7/7 PASS; full UI workflow not automated          |
| DEF-S8-003 | P1  | Browser data-safety privileged path       | **OPEN**    | Storage canaries PASS; privileged download tour missing                |
| DEF-S8-004 | P1  | UI performance / polling                  | **OPEN**    | Not separately measured this pass                                      |
| DEF-S8-005 | P1  | Full workflow accessibility               | **PARTIAL** | Authorized dashboard axe PASS; full keyboard workflow open             |
| DEF-S8-006 | P1  | Live tenant-isolation HTTP matrix         | **PARTIAL** | Cross-tenant 404 in permission + concurrency samples                   |
| DEF-S8-007 | P1  | Full live permission matrix               | **PARTIAL** | 14/15 HTTP cases; `import.template.manage` mutation route absent (404) |
| DEF-S8-012 | P1  | Retriable DLQ→replay on `:26`             | **OPEN**    | Tooling verified; retriable poison on current TD not proven            |
| DEF-S8-015 | P1  | Aurora performance matrix 5k/25k/100k     | **PARTIAL** | 500 + 5k COMPLETED; 25k/100k not run (worker/Aurora saturated at 5k)   |
| DEF-S8-016 | P1  | Concurrency limits                        | **PARTIAL** | 3 concurrent jobs OK; safe max unknown                                 |
| DEF-S8-017 | P1  | Alarm validation                          | **PARTIAL** | DLQ depth transition seen; queue-age/backlog incomplete                |
| DEF-S8-018 | P1  | Backup restore                            | **OPEN**    | No invasive PITR/clone this pass                                       |

## Previously closed

| ID         | Sev | Title                     | Status |
| ---------- | --- | ------------------------- | ------ |
| DEF-S8-009 | P2  | CSP/headers               | CLOSED |
| DEF-S8-021 | P1  | Dev principal CORS header | CLOSED |
| DEF-S8-022 | P1  | Seeded import personas    | CLOSED |

## P2

| ID         | Sev | Title                     | Status |
| ---------- | --- | ------------------------- | ------ |
| DEF-S8-008 | P2  | Sensitive canary residual | OPEN   |
| DEF-S8-014 | P2  | Stuck-job metric E2E      | OPEN   |

## Counts

| Severity | Open (incl. PARTIAL) | Closed |
| -------- | -------------------- | ------ |
| P0       | 0                    | 0      |
| P1       | 11                   | 10     |
| P2       | 2                    | 1      |

**Sprint gate:** `NOT_READY_FOR_REVIEW` — P1 must be 0; 11 P1 remain open/partial.
