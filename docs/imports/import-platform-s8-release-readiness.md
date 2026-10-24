# Import Platform S8 — Release Readiness

**Document:** `docs/imports/import-platform-s8-release-readiness.md`  
**Date:** 2026-07-30  
**Status:** **NOT_READY_FOR_REVIEW** — patch baseline deployed; P1 remaining = 11  
**Also see:** `docs/deployment/import-platform-s8-completion.md`

## Development deployment (current accepted patch)

| Item           | Value                                        |
| -------------- | -------------------------------------------- |
| Tag            | `import-s8-patch-20260730113557`             |
| API TD         | `:42`                                        |
| Worker TD      | `:26`                                        |
| Migration      | `0027`                                       |
| App secret     | Unchanged `2026-07-26T15:30:16.387000-05:00` |
| Scanner        | Outcome B                                    |
| Step Functions | Option B `RETAIN_SQS_ECS_WORKER_PATH`        |

## Checklist

### Architecture / decisions

- [x] Scanner decision complete (Outcome B)
- [x] Step Functions decision complete (`RETAIN_SQS_ECS_WORKER_PATH`)
- [x] No product adapters / no QR
- [x] Shared engine path retained

### Security

- [x] FORCE RLS post-deploy 45/45
- [x] S3 imports BPA + SSE-KMS + versioning + lifecycle
- [x] API + console CSP/security headers inspected
- [ ] Full live permission HTTP matrix (14/15; template.manage gap)
- [ ] Sensitive canary log hunt
- [ ] Privileged browser data-safety tour
- [x] Cross-tenant job GET sample returns 404

### Reliability

- [x] Worker crash recovery
- [x] Duplicate delivery idempotency
- [ ] Retriable DLQ→replay on worker `:26`
- [x] Stale-lock recovery
- [x] Cancellation recovery
- [x] Controlled rollback rehearsal (`:42`↔`:40`, `:26`↔`:25`)

### Performance

- [ ] Aurora 25k/100k matrix (500 + 5k done)
- [ ] Concurrency safe ceiling
- [x] Batch size 50/200

### Ops

- [ ] Full alarm validation
- [ ] Backup restore drill
- [x] Consoles wired to live API URL

### Product / UI

- [x] Authorized Import Center dashboard (Playwright)
- [ ] Full browser create→execute
- [x] Dashboard axe critical/serious
- [ ] Full keyboard workflow a11y

## Gate

| Rule             | Result                          |
| ---------------- | ------------------------------- |
| P0 = 0           | **PASS**                        |
| P1 = 0           | **FAIL** (11 open/partial)      |
| READY_FOR_REVIEW | **NO** — `NOT_READY_FOR_REVIEW` |

## Freeze / S9

- Platform freeze: **NOT AUTHORIZED** (`PLATFORM_FREEZE_PENDING_ACCEPTANCE`)
- S9 / product adapters / QR / production: **NOT AUTHORIZED**
