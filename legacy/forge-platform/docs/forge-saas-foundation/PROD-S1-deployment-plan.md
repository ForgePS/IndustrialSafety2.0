# PROD-S1 — Executable deployment ordering (NOT AUTHORIZED)

**Prerequisite:** PROD-S0R checkpoint GO or GO WITH CONDITIONS  
**This document is planning only. Do not execute in PROD-S0R.**

## Ordering

1. Verify approved `RELEASE_SHA` (immutable) on `origin/master`.
2. Clean worktree + remote sync (`git status` clean, unpushed commits = 0).
3. Fresh manual Aurora snapshot of `forge-production-rds-aurora` (retain snapshot id).
4. Apply application schema migrations against production (`pnpm` migrate path for prod secret — exact command in migration plan).
5. Verify schema / drizzle journal match (`migrate-status`).
6. Deploy backend/API (`Forge-Production-Compute` via guarded CDK) — no customer DNS.
7. Verify backend health (ALB/CloudFront default domain + `/health`).
8. Confirm Cognito app client URLs still match; wire runtime secrets/env.
9. Deploy remaining storage/application services (Messaging already required by Compute).
10. Deploy Creator Console (`Forge-Production-Frontend` / artifact sync).
11. Deploy Tenant Admin.
12. Deploy Industrial Web.
13. CloudFront invalidation for updated SPAs.
14. Production smoke tests (auth, health, tenancy read-only).
15. Verify CloudWatch alarms, WAF metrics, SNS topics receive a test publish.
16. **STOP** before customer migration / Firebase cutover / production DNS cutover.

## Explicit non-goals of PROD-S1 platform deploy

- Firestore / Firebase Auth / Firebase Storage migration
- Changing Producers or apex customer DNS to AWS
- Retiring Firebase as system of record
