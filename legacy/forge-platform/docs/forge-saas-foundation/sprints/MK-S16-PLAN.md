# MK-S16 Plan — Audit / Observability

## Objective

REUSE `@forge/audit` + `audit_events` + correlation middleware + `@forge/observability` + CloudWatch log groups. EXTEND missing SaaS audit writers (API keys, webhooks, module entitlements, export, support). HARDEN auth denial logging and categorized operational failure logs. No production ops; no parallel audit v2.

## Changes

1. Canonical SaaS audit action catalog in `@forge/audit`
2. Wire audit writes: API keys, webhooks, module entitlements, audit export, support action
3. Observability error categories + structured failure helper (jobs/webhooks/email/authz)
4. Authorization denial logging (`authorization_decision_log` + structured logs)
5. Exception filter → createLogger; TA audit UI correlation + export
6. Docs `AUDIT_OBSERVABILITY.md`; permission `platform.audit.export`

## Out of scope

- CAD/AI audit redesign
- Prod migrate/deploy / CloudTrail stack changes
- MK-S17 performance work
- Full async S3 audit archive worker
