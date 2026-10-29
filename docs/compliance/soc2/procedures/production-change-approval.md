# Production change approval

| Field          | Value                                       |
| -------------- | ------------------------------------------- |
| Document ID    | SOC2-PROC-007                               |
| Version        | 0.1                                         |
| Status         | APPROVED                                    |
| Owner          | Engineering Lead                            |
| Approver       | Jeremy Powell, Founder, Forge Public Safety |
| Related policy | See policies mapped in control matrix       |

## Trigger

PR targeting main/deploy to in-scope environment

## Frequency / timing

Every production-bound change

## Required permissions

- Ability to administer the relevant system (Cognito / IAM Identity Center / GitHub / ECS / CloudTrail read) per least privilege
- Access to write evidence under `docs/compliance/soc2/evidence/` (no secret values)

## Responsible role

Engineering Lead

## Required approvals

| Situation              | Approver                                                            |
| ---------------------- | ------------------------------------------------------------------- |
| Standard execution     | Operational owner (Engineering Lead)                                |
| Privileged / High risk | Jeremy Powell (Founder) or designated Security and Compliance Owner |
| Emergency path         | Incident Response Lead with post-approval within 1 business day     |

## Exact steps

1. Confirm the trigger condition and record ticket/issue ID.
2. Verify requester identity and authorization against access-control policy.
3. Perform the change using approved tools (AWS CLI with `forge-dev` profile for development, Cognito console/API, GitHub, CDK) — no undocumented console-only permanent config for infrastructure controls.
4. Capture evidence (screenshots/exports redacted; prefer JSON from `scripts/compliance/` where available).
5. Store evidence using naming `YYYY-MM-DD_<control-id>_<short-description>` under the appropriate `evidence/` subfolder.
6. Update related registers if risk/control status changes (risk-register, control-exceptions, access-reviews).
7. Notify stakeholders; close ticket with completion criteria checklist.

## Evidence generated

- Ticket/PR link
- Before/after access or config summary (redacted)
- Script output or CloudTrail event IDs when applicable
- Approver attestation for privileged actions

## Evidence storage

`docs/compliance/soc2/evidence/` (access/, change/, logging/, incidents/, backups/, training/ as applicable). Sensitive raw logs: store metadata + integrity hash + protected location pointer only.

## Escalation

If blocked > timing SLA, escalate to Engineering Lead, then Jeremy Powell for High/Critical impact.

## Failure handling

1. Do not leave partial privileged grants active.
2. Roll back temporary changes.
3. Open an incident if confidentiality or availability may be impacted.
4. File a control exception only if management accepts delayed remediation.

## Completion criteria

- Trigger addressed within timing SLA
- Evidence filed and indexed (or metadata recorded)
- Approvals captured
- No secrets committed
- Related control owner notified

## Revision history

| Version | Date       | Change                           |
| ------- | ---------- | -------------------------------- |
| 0.1     | 2026-07-26 | Phase 1 draft — PENDING_APPROVAL |
| 0.1     | 2026-07-26 | Approved by Jeremy Powell        |
