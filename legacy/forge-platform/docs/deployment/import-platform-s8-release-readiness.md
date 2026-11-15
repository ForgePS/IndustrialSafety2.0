# Import Platform S8 — Release-Readiness Checklist

**Status:** OPEN — incomplete gates prevent production pilot  
**Date:** 2026-07-29

## Architecture

- [x] Shared engine confirmed (no product forks)
- [x] No QR work
- [x] Adapter interface unchanged / no adapters shipped
- [x] Scanner decision complete (Outcome B)
- [x] Step Functions decision complete (Option B)

## Security

- [x] Production scanner ambiguity closed (fail closed)
- [x] Tenant isolation live re-verify (S8 RLS 45/45)
- [x] FORCE RLS re-verify this sprint
- [ ] Sensitive canary sweep executed
- [ ] Browser storage leakage suite executed
- [ ] CSP / security headers browser evidence
- [x] Protected download design preserved (S7); browser evidence still LIM

## Reliability

- [x] DLQ tooling + runbook
- [x] Worker recovery runbook
- [x] Stuck-job thresholds + runbook
- [ ] Worker crash/restart live drill
- [ ] Duplicate delivery live drill
- [ ] DLQ replay live drill (non-empty controlled message)
- [ ] Backup restore controlled test

## Performance

- [x] Batch defaults documented (50 / max 500)
- [x] In-process 500-row + 5k smoke green
- [ ] Aurora 5k / 25k / 100k matrix
- [ ] Concurrency limits measured on Aurora

## Accessibility / UI

- [x] Production restriction banner (code)
- [ ] Frontend deploy with banner
- [ ] Automated axe on Import Center routes
- [ ] Keyboard-only full workflow evidence

## Operations

- [x] Import dashboards published (development)
- [x] Existing backlog/DLQ alarms OK
- [x] CLI alarms: queue-age / worker-tasks / scanner-blocked
- [ ] CDK synth/deploy parity for monitoring construct
- [x] Runbooks indexed

## Documentation

- [x] ADRs
- [x] Open limitations register
- [x] Freeze doc (`PLATFORM_FREEZE_PENDING_ACCEPTANCE`)
- [x] Architecture / security / ops / testing set
- [ ] Results doc updated after remaining controlled runs

## Deployment

- [x] API/worker S8 images deployed (`:40` / `:25`, tag `import-s8-20260729182259`)
- [x] Frontend S8 banner deployed (console + tenant-admin)
- [ ] Rollback drill recorded
- [x] No laptop production deploy performed
- [x] App secret unchanged

## Defect bar

- [ ] No open P0
- [ ] No open P1
- [ ] P2 reviewed

**Sign-off:** _pending — do not mark READY_FOR_REVIEW until unchecked critical gates close_
