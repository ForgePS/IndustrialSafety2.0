# Decision record: Import Step Functions — production posture (S8)

**Status:** ACCEPTED  
**Date:** 2026-07-29  
**Updated:** 2026-07-30 (closeout naming)  
**Decision ID:** import-step-functions-production-decision  
**Owner:** Platform infrastructure / Import Platform engineering (interim)  
**Approval status:** ACCEPTED — not PENDING

## Outcome selected

**Option B — `RETAIN_SQS_ECS_WORKER_PATH`**

Do **not** use Option A (`ACTIVATE_STEP_FUNCTIONS`) for this release.

Step Functions remains **inactive**. Package status string may still read `DEFINITION_COMPLETE_DEPLOYMENT_PENDING` (definition retained only). That string does **not** mean the production decision is pending — the production decision is **Option B / `RETAIN_SQS_ECS_WORKER_PATH`**.

## Context

S5 delivered an ASL definition with S6 security-verdict gate in the package. CDK construct exists with `activate: false`. Live AWS inspection shows **no** import Step Functions state machine (`list-state-machines` empty for import). Operational path is **API → SQS → ECS worker**.

## Evaluation (evidence-based)

| Factor                        | Finding                                                                                     |
| ----------------------------- | ------------------------------------------------------------------------------------------- |
| Current worker reliability    | Development worker path operational (TD `:25`); formal crash/restart drill **NOT_VERIFIED** |
| Retry requirements            | SQS visibility + `maxReceiveCount` 3 + DLQ meet current needs                               |
| State visibility              | Job/DB + CloudWatch queue/worker dashboards; not SFN execution history                      |
| Cost                          | Activating SFN adds cost without proven benefit at current scale                            |
| Payload size                  | Queue contract already constrains messages; SFN would not remove need for redaction         |
| Execution-history sensitivity | SFN history would add another sensitive surface                                             |
| Operational complexity        | Dual-path (SFN + worker) increases ops burden                                               |
| IAM complexity                | Extra roles/policies for SFN/Pipes                                                          |
| Recovery benefit              | Unproven vs SQS redelivery + journal idempotency                                            |
| GovCloud compatibility        | Prefer simpler path until activation authorized                                             |
| Deployment risk               | Activation without E2E + rollback plan is high risk                                         |

## Decision details

1. Keep **API → SQS → ECS worker** as the production execution path.
2. Do not activate SFN merely because a definition exists.
3. Monitoring and runbooks focus on SQS / worker / DLQ — **not** Step Functions.
4. UI must not claim Step Functions is active.
5. Retain ASL + CDK construct for future Option A activation only.
6. **No activation occurred during S8 closeout.**

## Deployed execution path (confirmed)

| Item      | Value                                                    |
| --------- | -------------------------------------------------------- |
| Image tag | `import-s8-20260729182259`                               |
| API TD    | `:40`                                                    |
| Worker TD | `:25`                                                    |
| SFN live  | None (list empty for import)                             |
| Path      | API → SQS (`forge-development-sqs-imports`) → ECS worker |

## Activation criteria (future Option A)

- Explicit product/ops authorization for `ACTIVATE_STEP_FUNCTIONS`
- EventBridge Pipe or equivalent with redacted payloads
- End-to-end tests, cost review, alarm/dashboard parity
- Rollback plan and dual-path disablement procedure
- Confirmed benefit over SQS worker for orchestration scale

## Consequences

- Misleading “SFN is live” claims are prohibited.
- Security gates remain in API execute + worker process paths (not dependent on SFN).
