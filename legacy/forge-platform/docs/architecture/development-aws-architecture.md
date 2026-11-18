# Development AWS architecture (Sprint 1C)

Single-account commercial development baseline.

```
Internet → ALB (+ WAF) → ECS platform-api (private)
                       → ECS worker-service (private, no LB)
                       → Aurora PostgreSQL (isolated)
S3 (documents/imports/exports/audit/assets)
SQS + DLQ + EventBridge domain bus
Cognito user pool (app clients per surface)
KMS CMKs (sensitive key separate)
```

GovCloud is configuration-ready via `partition` / `govcloud-*.ts` — **not deployed** in 1C.
