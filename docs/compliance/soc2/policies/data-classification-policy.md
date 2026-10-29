# Data Classification Policy

| Field            | Value                                       |
| ---------------- | ------------------------------------------- |
| Document ID      | SOC2-POL-009                                |
| Version          | 0.1                                         |
| Status           | APPROVED                                    |
| Owner            | Security and Compliance Owner               |
| Approver         | Jeremy Powell, Founder, Forge Public Safety |
| Effective date   | 2026-07-26                                  |
| Next review date | 2027-07-26                                  |

## Purpose

Classification and handling of Forge data (Public, Internal, Confidential, Restricted).

This policy supports the Forge SOC 2 **readiness** program. It does **not** authorize claims that Forge is SOC 2 certified, compliant, audited, or Type 1/Type 2 complete.

## Scope

Applies to the Forge Public Safety system boundary documented in `docs/compliance/soc2/scope/`, including Creator Console, RMS Web, NERIS Phase 1–2, Cognito, Aurora PostgreSQL (FORCE RLS / `forge_app`), ECS Fargate, CloudFront, S3, KMS, Secrets Manager, EventBridge, SQS, CloudWatch, CloudTrail (when enabled), and CI/CD. NERIS Phase 3 is out of scope until separately authorized.

## Definitions

- **Privileged access:** Ability to change security configuration, read cross-tenant data, or administer AWS/IAM/KMS/Secrets/Database admin roles.
- **Production change:** Any merge or deploy affecting the in-scope AWS environment or customer-facing Forge modules.
- **Evidence:** Artifacts under `docs/compliance/soc2/evidence/` (no secrets or raw customer PII).

## Requirements

1. Preserve working technical controls; do not weaken FORCE RLS, `forge_app` runtime separation, Cognito authentication, or encryption to satisfy documentation alone.
2. Changes to in-scope systems follow Change Management and Secure Development policies (PR review + CI gates including gitleaks, RLS tests, and cdk-nag where applicable).
3. Privileged AWS and application admin access is least privilege, reviewed at least quarterly, and logged.
4. Security-relevant AWS management activity is recorded in CloudTrail when the control is enabled; application audit events record sensitive tenant actions.
5. Secrets are stored in Secrets Manager (or equivalent approved store), never committed to Git.
6. Data is classified and handled per the Data Classification Policy; Confidential/Restricted data uses approved encryption in transit and at rest.
7. Incidents are declared and handled per Incident Response Policy; backup/restore expectations follow Backup and Recovery Policy.
8. Marketing and customer communications must not claim SOC 2 certification status beyond approved readiness language.
9. Exceptions require documented approval, residual risk, compensating control, and expiry per Exception Management Policy.
10. Control owners maintain evidence per the control matrix and testing plan.

### Classification model

| Class        | Examples                                               | Handling                                     |
| ------------ | ------------------------------------------------------ | -------------------------------------------- |
| Public       | Marketing site copy                                    | No confidentiality controls beyond integrity |
| Internal     | Architecture docs, non-secret configs                  | Need-to-know; repo access controlled         |
| Confidential | Tenant operational RMS/NERIS data, Cognito identifiers | Encryption, RLS, least privilege             |
| Restricted   | Secrets, KMS key material references, SSN if present   | Secrets Manager/KMS; minimal access; no Git  |

CloudTrail evidence exports are Confidential; secret values never enter Git evidence.

## Roles and responsibilities

| Role                          | Responsibility                                                                 |
| ----------------------------- | ------------------------------------------------------------------------------ |
| Jeremy Powell (Founder)       | Policy approval; High/Critical risk acceptance; claims restriction enforcement |
| Security and Compliance Owner | Operational ownership of this policy                                           |
| Engineering Lead              | Ensure engineering practices implement requirements                            |
| All personnel                 | Follow policy; report violations and incidents                                 |

## Exceptions

Exceptions are requested via `procedures/control-exception-approval.md` and recorded in `controls/control-exceptions.md`. Expired exceptions must be closed or re-approved.

## Enforcement

Violations may result in access revocation, required remediation, and incident declaration. Willful circumvention of tenant isolation or logging controls is treated as a security incident.

## Related controls

C-CNF-01, C-CNF-02, CC-ISO-01

## Related procedures

See `docs/compliance/soc2/procedures/` for operating procedures mapped to access, change, logging, incident, backup, and exception workflows.

## Required evidence

- Approved policy attestation (this document once APPROVED)
- Linked control evidence in `docs/compliance/soc2/evidence/`
- Access reviews, change samples, CloudTrail exports, and test results as applicable

## Revision history

| Version | Date       | Change                           |
| ------- | ---------- | -------------------------------- |
| 0.1     | 2026-07-26 | Phase 1 draft — PENDING_APPROVAL |
| 0.1     | 2026-07-26 | Approved by Jeremy Powell        |
