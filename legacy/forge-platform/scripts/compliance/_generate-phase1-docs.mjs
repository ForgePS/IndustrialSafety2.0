import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const policiesRoot = join("docs", "compliance", "soc2", "policies");
const proceduresRoot = join("docs", "compliance", "soc2", "procedures");
mkdirSync(policiesRoot, { recursive: true });
mkdirSync(proceduresRoot, { recursive: true });

const policies = [
  [
    "information-security-policy.md",
    "SOC2-POL-001",
    "Information Security Policy",
    "Security and Compliance Owner",
    "CC-GOV-01, CC-GOV-02, CC-SEC-01, CC-SEC-02",
    "Umbrella information security requirements for the Forge Public Safety platform.",
  ],
  [
    "access-control-policy.md",
    "SOC2-POL-002",
    "Access Control Policy",
    "Identity and Access Management Owner",
    "CC-ACC-01, CC-ACC-02, CC-ACC-03, CC-ACC-04",
    "Least-privilege access for AWS, Cognito, application, and database roles.",
  ],
  [
    "authentication-and-mfa-policy.md",
    "SOC2-POL-003",
    "Authentication and MFA Policy",
    "Identity and Access Management Owner",
    "CC-ACC-01",
    "Authentication strength for Cognito users and privileged AWS access.",
  ],
  [
    "secure-development-policy.md",
    "SOC2-POL-004",
    "Secure Development Policy",
    "Engineering Lead",
    "CC-CHG-01, CC-CHG-02, CC-CI-01, CC-CI-02, CC-ISO-03",
    "Secure SDLC for Forge application and infrastructure code.",
  ],
  [
    "change-management-policy.md",
    "SOC2-POL-005",
    "Change Management Policy",
    "Engineering Lead",
    "CC-CHG-01, CC-CHG-02, CC-CHG-03",
    "Controlled changes via PR, CI, and CDK deploy.",
  ],
  [
    "logging-and-monitoring-policy.md",
    "SOC2-POL-006",
    "Logging and Monitoring Policy",
    "AWS Infrastructure Owner",
    "CC-LOG-01, CC-MON-01, CC-MON-02, CC-ISO-04",
    "Security-relevant logging including CloudTrail, CloudWatch, and application audit events.",
  ],
  [
    "incident-response-policy.md",
    "SOC2-POL-007",
    "Incident Response Policy",
    "Incident Response Lead",
    "CC-IR-01",
    "Detection, declaration, containment, and lessons learned for security incidents.",
  ],
  [
    "backup-and-recovery-policy.md",
    "SOC2-POL-008",
    "Backup and Recovery Policy",
    "Business Continuity Owner",
    "A-AVL-01, A-AVL-02, A-AVL-03",
    "Backup retention and restore testing for availability.",
  ],
  [
    "data-classification-policy.md",
    "SOC2-POL-009",
    "Data Classification Policy",
    "Security and Compliance Owner",
    "C-CNF-01, C-CNF-02, CC-ISO-01",
    "Classification and handling of Forge data (Public, Internal, Confidential, Restricted).",
  ],
  [
    "encryption-and-key-management-policy.md",
    "SOC2-POL-010",
    "Encryption and Key Management Policy",
    "AWS Infrastructure Owner",
    "CC-CRY-01, CC-CRY-02, CC-SEC-01",
    "KMS, TLS, and Secrets Manager requirements.",
  ],
  [
    "vulnerability-management-policy.md",
    "SOC2-POL-011",
    "Vulnerability Management Policy",
    "Application Security Owner",
    "CC-CI-02, CC-CHG-02",
    "Intake, triage, and remediation of vulnerabilities.",
  ],
  [
    "support-access-policy.md",
    "SOC2-POL-012",
    "Support Access Policy",
    "Identity and Access Management Owner",
    "CC-ACC-03, CC-ACC-04",
    "Time-bounded support access to customer tenants and privileged tools.",
  ],
  [
    "document-control-policy.md",
    "SOC2-POL-013",
    "Document Control Policy",
    "Security and Compliance Owner",
    "CC-GOV-01",
    "Versioning and approval of compliance documents under docs/compliance/soc2.",
  ],
  [
    "risk-management-policy.md",
    "SOC2-POL-014",
    "Risk Management Policy",
    "Security and Compliance Owner",
    "CC-GOV-01",
    "Risk assessment methodology and acceptance rules.",
  ],
  [
    "exception-management-policy.md",
    "SOC2-POL-015",
    "Exception Management Policy",
    "Security and Compliance Owner",
    "CC-GOV-01",
    "Control exceptions with expiry and compensating controls.",
  ],
];

const policyExtras = {
  "SOC2-POL-002": `### Access-specific requirements
1. Cognito is the customer authentication IdP for in-scope apps.
2. Tenant membership and application permissions must be resolved before data access.
3. Runtime database access uses \`forge_app\` (no BYPASSRLS); \`forge_admin\` is limited to migrations and approved administration.
4. Quarterly privileged access reviews are mandatory (see quarterly-access-review procedure).
5. Joiner/mover/leaver changes complete within 1 business day of approved request for privileged access; standard user termination within 1 business day of HR/ops notice.`,
  "SOC2-POL-003": `### Authentication-specific requirements
1. Customer-facing Cognito pools must not enable self-sign-up in production-bound configurations unless explicitly approved.
2. Privileged AWS console access uses IAM Identity Center (SSO) with MFA enforced at the IdP.
3. Password and MFA settings follow Cognito pool configuration reviewed at least annually.
4. Service credentials use IAM roles or Secrets Manager — not long-lived keys in application code.`,
  "SOC2-POL-006": `### Logging-specific requirements
1. CloudTrail (when enabled) records multi-region management read/write events with log file validation and encrypted S3 delivery.
2. CloudWatch retains security logs per environment retention configuration.
3. Application audit events capture actor, action, tenant, and timestamp for sensitive operations.
4. CloudTrail log buckets reject public access and insecure transport; application roles must not hold delete rights on trail objects.
5. Metric filters/alarms cover trail stop/delete, root activity, unauthorized API calls, IAM/KMS/network/S3 policy changes where detectable.`,
  "SOC2-POL-009": `### Classification model
| Class | Examples | Handling |
| --- | --- | --- |
| Public | Marketing site copy | No confidentiality controls beyond integrity |
| Internal | Architecture docs, non-secret configs | Need-to-know; repo access controlled |
| Confidential | Tenant operational RMS/NERIS data, Cognito identifiers | Encryption, RLS, least privilege |
| Restricted | Secrets, KMS key material references, SSN if present | Secrets Manager/KMS; minimal access; no Git |

CloudTrail evidence exports are Confidential; secret values never enter Git evidence.`,
};

for (const [file, id, title, owner, controls, purpose] of policies) {
  const extra = policyExtras[id] ?? "";
  const body = `# ${title}

| Field | Value |
| --- | --- |
| Document ID | ${id} |
| Version | 0.1 |
| Status | PENDING_APPROVAL |
| Owner | ${owner} |
| Approver | Jeremy Powell, Founder, Forge Public Safety |
| Effective date | Pending approval |
| Next review date | Within 12 months of approval |

## Purpose

${purpose}

This policy supports the Forge SOC 2 **readiness** program. It does **not** authorize claims that Forge is SOC 2 certified, compliant, audited, or Type 1/Type 2 complete.

## Scope

Applies to the Forge Public Safety system boundary documented in \`docs/compliance/soc2/scope/\`, including Creator Console, RMS Web, NERIS Phase 1–2, Cognito, Aurora PostgreSQL (FORCE RLS / \`forge_app\`), ECS Fargate, CloudFront, S3, KMS, Secrets Manager, EventBridge, SQS, CloudWatch, CloudTrail (when enabled), and CI/CD. NERIS Phase 3 is out of scope until separately authorized.

## Definitions

- **Privileged access:** Ability to change security configuration, read cross-tenant data, or administer AWS/IAM/KMS/Secrets/Database admin roles.
- **Production change:** Any merge or deploy affecting the in-scope AWS environment or customer-facing Forge modules.
- **Evidence:** Artifacts under \`docs/compliance/soc2/evidence/\` (no secrets or raw customer PII).

## Requirements

1. Preserve working technical controls; do not weaken FORCE RLS, \`forge_app\` runtime separation, Cognito authentication, or encryption to satisfy documentation alone.
2. Changes to in-scope systems follow Change Management and Secure Development policies (PR review + CI gates including gitleaks, RLS tests, and cdk-nag where applicable).
3. Privileged AWS and application admin access is least privilege, reviewed at least quarterly, and logged.
4. Security-relevant AWS management activity is recorded in CloudTrail when the control is enabled; application audit events record sensitive tenant actions.
5. Secrets are stored in Secrets Manager (or equivalent approved store), never committed to Git.
6. Data is classified and handled per the Data Classification Policy; Confidential/Restricted data uses approved encryption in transit and at rest.
7. Incidents are declared and handled per Incident Response Policy; backup/restore expectations follow Backup and Recovery Policy.
8. Marketing and customer communications must not claim SOC 2 certification status beyond approved readiness language.
9. Exceptions require documented approval, residual risk, compensating control, and expiry per Exception Management Policy.
10. Control owners maintain evidence per the control matrix and testing plan.

${extra}

## Roles and responsibilities

| Role | Responsibility |
| --- | --- |
| Jeremy Powell (Founder) | Policy approval; High/Critical risk acceptance; claims restriction enforcement |
| ${owner} | Operational ownership of this policy |
| Engineering Lead | Ensure engineering practices implement requirements |
| All personnel | Follow policy; report violations and incidents |

## Exceptions

Exceptions are requested via \`procedures/control-exception-approval.md\` and recorded in \`controls/control-exceptions.md\`. Expired exceptions must be closed or re-approved.

## Enforcement

Violations may result in access revocation, required remediation, and incident declaration. Willful circumvention of tenant isolation or logging controls is treated as a security incident.

## Related controls

${controls}

## Related procedures

See \`docs/compliance/soc2/procedures/\` for operating procedures mapped to access, change, logging, incident, backup, and exception workflows.

## Required evidence

- Approved policy attestation (this document once APPROVED)
- Linked control evidence in \`docs/compliance/soc2/evidence/\`
- Access reviews, change samples, CloudTrail exports, and test results as applicable

## Revision history

| Version | Date | Change |
| --- | --- | --- |
| 0.1 | 2026-07-26 | Phase 1 draft — PENDING_APPROVAL |
`;
  writeFileSync(join(policiesRoot, file), body);
}

writeFileSync(
  join(policiesRoot, "README.md"),
  `# Policies

All Phase 1 policies are **PENDING_APPROVAL**. Git commit is not approval. Approver: Jeremy Powell, Founder.

| ID | File | Status |
| --- | --- | --- |
${policies.map(([f, id, title]) => `| ${id} | [${title}](${f}) | PENDING_APPROVAL |`).join("\n")}
`,
);

const procedures = [
  [
    "user-onboarding.md",
    "SOC2-PROC-001",
    "User onboarding",
    "Approved joiner request for Cognito or AWS access",
    "Identity and Access Management Owner",
    "Weekly as requests arrive; within 1 business day of approval",
  ],
  [
    "user-role-modification.md",
    "SOC2-PROC-002",
    "User role modification",
    "Approved mover request changing roles/permissions",
    "Identity and Access Management Owner",
    "Within 1 business day of approval",
  ],
  [
    "user-termination.md",
    "SOC2-PROC-003",
    "User termination",
    "HR/ops termination notice or security incident",
    "Identity and Access Management Owner",
    "Same business day for privileged; within 1 business day otherwise",
  ],
  [
    "privileged-access-approval.md",
    "SOC2-PROC-004",
    "Privileged access approval",
    "Request for admin/AWS/DB privileged rights",
    "Identity and Access Management Owner",
    "Before granting; no standing undocumented privilege",
  ],
  [
    "emergency-access.md",
    "SOC2-PROC-005",
    "Emergency access",
    "Sev-1/2 incident requiring break-glass access",
    "Incident Response Lead",
    "Only during declared incident; expires ≤ 24 hours unless re-approved",
  ],
  [
    "quarterly-access-review.md",
    "SOC2-PROC-006",
    "Quarterly access review",
    "Calendar quarter end + 10 business days",
    "Identity and Access Management Owner",
    "Once per calendar quarter",
  ],
  [
    "production-change-approval.md",
    "SOC2-PROC-007",
    "Production change approval",
    "PR targeting main/deploy to in-scope environment",
    "Engineering Lead",
    "Every production-bound change",
  ],
  [
    "emergency-change.md",
    "SOC2-PROC-008",
    "Emergency change",
    "Sev-1/2 fix requiring expedited deploy",
    "Engineering Lead",
    "During incident; retrospective PR within 2 business days",
  ],
  [
    "vulnerability-triage.md",
    "SOC2-PROC-009",
    "Vulnerability triage",
    "Scanner finding, gitleaks alert, or disclosed vuln",
    "Application Security Owner",
    "Critical ≤ 1 business day; High ≤ 5; Medium ≤ 30",
  ],
  [
    "security-alert-review.md",
    "SOC2-PROC-010",
    "Security alert review",
    "CloudWatch security alarm or CloudTrail filter match",
    "AWS Infrastructure Owner",
    "Business-hours: 4 hours; after-hours Sev-1 path per IR",
  ],
  [
    "incident-declaration.md",
    "SOC2-PROC-011",
    "Incident declaration",
    "Suspected confidentiality/availability/security impact",
    "Incident Response Lead",
    "Immediate upon criteria met",
  ],
  [
    "incident-evidence-preservation.md",
    "SOC2-PROC-012",
    "Incident evidence preservation",
    "Declared incident",
    "Incident Response Lead",
    "Within 1 hour of declaration",
  ],
  [
    "backup-verification.md",
    "SOC2-PROC-013",
    "Backup verification",
    "First business Monday each month",
    "Business Continuity Owner",
    "Monthly",
  ],
  [
    "restore-testing.md",
    "SOC2-PROC-014",
    "Restore testing",
    "Semi-annual schedule or major architecture change",
    "Business Continuity Owner",
    "At least twice per year",
  ],
  [
    "policy-review.md",
    "SOC2-PROC-015",
    "Policy review",
    "Annual anniversary or material system change",
    "Security and Compliance Owner",
    "At least annually",
  ],
  [
    "control-exception-approval.md",
    "SOC2-PROC-016",
    "Control exception approval",
    "Request to deviate from required control",
    "Security and Compliance Owner",
    "Before exception takes effect",
  ],
  [
    "support-access-authorization.md",
    "SOC2-PROC-017",
    "Support access authorization",
    "Customer/support ticket needing elevated access",
    "Identity and Access Management Owner",
    "Per ticket; max duration 8 hours default",
  ],
  [
    "support-access-expiration.md",
    "SOC2-PROC-018",
    "Support access expiration",
    "Support access end time reached or ticket closed",
    "Identity and Access Management Owner",
    "At expiry; verify within 1 hour",
  ],
  [
    "cloudtrail-review.md",
    "SOC2-PROC-019",
    "CloudTrail review",
    "Weekly security operations cadence + after incidents",
    "Security and Compliance Owner",
    "Weekly sample review; full export monthly via evidence scripts",
  ],
];

for (const [file, id, title, trigger, role, frequency] of procedures) {
  const body = `# ${title}

| Field | Value |
| --- | --- |
| Document ID | ${id} |
| Version | 0.1 |
| Status | PENDING_APPROVAL |
| Owner | ${role} |
| Approver | Jeremy Powell, Founder, Forge Public Safety |
| Related policy | See policies mapped in control matrix |

## Trigger

${trigger}

## Frequency / timing

${frequency}

## Required permissions

- Ability to administer the relevant system (Cognito / IAM Identity Center / GitHub / ECS / CloudTrail read) per least privilege
- Access to write evidence under \`docs/compliance/soc2/evidence/\` (no secret values)

## Responsible role

${role}

## Required approvals

| Situation | Approver |
| --- | --- |
| Standard execution | Operational owner (${role}) |
| Privileged / High risk | Jeremy Powell (Founder) or designated Security and Compliance Owner |
| Emergency path | Incident Response Lead with post-approval within 1 business day |

## Exact steps

1. Confirm the trigger condition and record ticket/issue ID.
2. Verify requester identity and authorization against access-control policy.
3. Perform the change using approved tools (AWS CLI with \`forge-dev\` profile for development, Cognito console/API, GitHub, CDK) — no undocumented console-only permanent config for infrastructure controls.
4. Capture evidence (screenshots/exports redacted; prefer JSON from \`scripts/compliance/\` where available).
5. Store evidence using naming \`YYYY-MM-DD_<control-id>_<short-description>\` under the appropriate \`evidence/\` subfolder.
6. Update related registers if risk/control status changes (risk-register, control-exceptions, access-reviews).
7. Notify stakeholders; close ticket with completion criteria checklist.

## Evidence generated

- Ticket/PR link
- Before/after access or config summary (redacted)
- Script output or CloudTrail event IDs when applicable
- Approver attestation for privileged actions

## Evidence storage

\`docs/compliance/soc2/evidence/\` (access/, change/, logging/, incidents/, backups/, training/ as applicable). Sensitive raw logs: store metadata + integrity hash + protected location pointer only.

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

| Version | Date | Change |
| --- | --- | --- |
| 0.1 | 2026-07-26 | Phase 1 draft — PENDING_APPROVAL |
`;
  writeFileSync(join(proceduresRoot, file), body);
}

writeFileSync(
  join(proceduresRoot, "README.md"),
  `# Procedures

Phase 1 operating procedures. Status: **PENDING_APPROVAL** until management approval is recorded.

| ID | Procedure | Frequency highlight |
| --- | --- | --- |
${procedures.map(([f, id, title, , , freq]) => `| ${id} | [${title}](${f}) | ${freq} |`).join("\n")}
`,
);

console.log(`Wrote ${policies.length} policies and ${procedures.length} procedures`);
