# Control Matrix

**Document ID:** SOC2-CTL-001  
**Version:** 0.2  
**Date:** 2026-07-26

Maps Forge control activities to Trust Services Criteria themes. **Operating status** is an engineering self-assessment for readiness — not an auditor opinion.

Legend: **Operating** | **Partial** | **Not operating** | **Planned**

TSC references use common shorthand (CC = Common Criteria / Security; A = Availability; C = Confidentiality). Exact point citations will be refined with the CPA firm.

---

## Governance and claims

| Control ID | Control activity                                 | TSC       | Implementation (existing) | Policy / procedure  | Evidence           | Status  |
| ---------- | ------------------------------------------------ | --------- | ------------------------- | ------------------- | ------------------ | ------- |
| CC-GOV-01  | Maintain SOC 2 readiness documentation and scope | CC1 / CC2 | `docs/compliance/soc2/*`  | This program README | Scope + risk packs | Partial |
| CC-GOV-02  | Prohibit unauthorized SOC 2 marketing claims     | CC1       | README claims boundary    | Policy TBD          | Training ack       | Partial |

---

## Identity, access, and tenancy

| Control ID | Control activity                                        | TSC      | Implementation (existing)           | Policy / procedure                   | Evidence                         | Status        |
| ---------- | ------------------------------------------------------- | -------- | ----------------------------------- | ------------------------------------ | -------------------------------- | ------------- |
| CC-ACC-01  | Authenticate end users via Cognito                      | CC6      | Amazon Cognito + JWT validation     | Policy TBD                           | Cognito config export (redacted) | Operating     |
| CC-ACC-02  | Authorize via tenant membership + app permissions       | CC6      | Membership resolution + authz layer | `docs/architecture/authorization.md` | Authz tests / Phase 2 isolation  | Operating     |
| CC-ACC-03  | Periodically review privileged AWS and admin app access | CC6      | **Cadence not yet formal**          | `../access-reviews/`                 | Access review worksheets         | Not operating |
| CC-ACC-04  | Provision / deprovision access timely                   | CC6      | Manual / ops process TBD            | Procedure TBD                        | Ticket + Cognito evidence        | Partial       |
| CC-ISO-01  | Enforce PostgreSQL FORCE RLS on tenant data             | C1 / CC6 | Aurora FORCE RLS                    | `docs/security/tenant-isolation.md`  | `phase2-verify-rls` / CI RLS     | Operating     |
| CC-ISO-02  | Runtime DB role is `forge_app` (no BYPASSRLS)           | C1 / CC6 | App secret + ECS task def           | Ops procedure TBD                    | Task def secret ARN verify       | Operating     |
| CC-ISO-03  | Automated isolation / RLS regression tests              | C1       | Playwright isolation + CI           | Test plan                            | CI + e2e reports                 | Operating     |
| CC-ISO-04  | Application audit events for sensitive actions          | CC7      | Forge audit logging                 | `docs/security/audit-logging.md`     | Sample audit records (redacted)  | Operating     |

---

## Cryptography and secrets

| Control ID | Control activity                                            | TSC      | Implementation (existing)        | Policy / procedure                   | Evidence                    | Status    |
| ---------- | ----------------------------------------------------------- | -------- | -------------------------------- | ------------------------------------ | --------------------------- | --------- |
| CC-CRY-01  | Encrypt data at rest with KMS                               | C1 / CC6 | KMS + service encryption         | `docs/security/encryption-design.md` | CDK / AWS config            | Operating |
| CC-CRY-02  | TLS in transit at CloudFront / HTTPS endpoints              | C1 / CC6 | CloudFront HTTPS + header verify | Network security design              | `phase2-verify-headers`     | Operating |
| CC-SEC-01  | Store credentials in Secrets Manager; separate app vs admin | CC6      | Secrets Manager dual secrets     | Procedure TBD                        | Secret metadata (no values) | Operating |
| CC-SEC-02  | Prevent secrets in source control                           | CC6      | gitleaks in CI                   | Dev data / secure SDLC policy        | CI gitleaks results         | Operating |

---

## Change management and SDLC

| Control ID | Control activity                                 | TSC       | Implementation (existing)              | Policy / procedure      | Evidence               | Status    |
| ---------- | ------------------------------------------------ | --------- | -------------------------------------- | ----------------------- | ---------------------- | --------- |
| CC-CHG-01  | Peer-reviewed changes via pull request           | CC8       | GitHub PRs                             | `../change-management/` | PR history             | Operating |
| CC-CHG-02  | CI security/quality gates before merge/deploy    | CC8       | RLS tests, gitleaks, cdk-nag, unit/e2e | CI workflows            | Workflow run artifacts | Operating |
| CC-CHG-03  | Infrastructure changes via CDK (IaC)             | CC8       | `packages/infra`                       | Change procedure TBD    | CDK diff / deploy logs | Operating |
| CC-CI-01   | Protect CI supply chain (Actions pinning/review) | CC8       | Partial — formalize                    | Procedure TBD           | Workflow audit notes   | Partial   |
| CC-CI-02   | Secret scanning on commits/PRs                   | CC6 / CC8 | gitleaks                               | —                       | CI logs                | Operating |

---

## Logging, monitoring, and detection

| Control ID | Control activity                                   | TSC     | Implementation (existing)                                                                           | Policy / procedure                                                                                   | Evidence                                      | Status        |
| ---------- | -------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------- | ------------- |
| CC-LOG-01  | Record AWS management API activity (CloudTrail)    | CC7     | CDK `ForgeCloudTrail` / stack `Forge-Development-Audit` (multi-region, validation, CW Logs, KMS S3) | `policies/logging-and-monitoring-policy.md` (APPROVED); `procedures/cloudtrail-review.md` (APPROVED) | `evidence/cloudtrail/*` (ACCEPTED 2026-07-26) | **Operating** |
| CC-MON-01  | Application and infra metrics/logs in CloudWatch   | CC7 / A | CloudWatch                                                                                          | Ops runbooks TBD                                                                                     | Alarm config / screenshots                    | Operating     |
| CC-MON-02  | Threat detection services (GuardDuty/Security Hub) | CC7     | Config flags; largely unwired                                                                       | —                                                                                                    | —                                             | Not operating |
| CC-IR-01   | Documented incident response and escalation        | CC7     | Folder scaffold only                                                                                | `../incidents/`                                                                                      | Tabletop + tickets                            | Not operating |

---

## Availability

| Control ID | Control activity                           | TSC | Implementation (existing)             | Policy / procedure        | Evidence            | Status        |
| ---------- | ------------------------------------------ | --- | ------------------------------------- | ------------------------- | ------------------- | ------------- |
| A-AVL-01   | Multi-AZ capable data/compute architecture | A   | Aurora / Fargate patterns             | BCP TBD                   | Architecture docs   | Partial       |
| A-AVL-02   | Backup of critical data stores             | A   | Backup construct flagged — **verify** | `../business-continuity/` | Backup job evidence | Partial       |
| A-AVL-03   | Periodic restore / recovery test           | A   | Not yet evidenced                     | BCP/DR procedure          | Restore test report | Not operating |
| A-AVL-04   | Edge protection / DoS resilience           | A   | CloudFront; WAF optional              | —                         | WAF/CF config       | Partial       |

---

## Confidentiality (additional)

| Control ID | Control activity                      | TSC      | Implementation (existing)                       | Policy / procedure      | Evidence              | Status    |
| ---------- | ------------------------------------- | -------- | ----------------------------------------------- | ----------------------- | --------------------- | --------- |
| C-CNF-01   | Data classification and handling      | C1       | Development data policy exists; full class. TBD | Policy pack             | Classification matrix | Partial   |
| C-CNF-02   | Least-privilege network paths to data | C1 / CC6 | Private subnets, SGs                            | Network security design | SG/NACL evidence      | Operating |

---

## Vendors

| Control ID | Control activity                                      | TSC | Implementation (existing) | Policy / procedure | Evidence         | Status        |
| ---------- | ----------------------------------------------------- | --- | ------------------------- | ------------------ | ---------------- | ------------- |
| CC-VEN-01  | Review AWS (and GitHub) SOC/security reports annually | CC9 | Not yet scheduled         | `../vendors/`      | Review checklist | Not operating |

---

## Inheritance note

Creator Console, RMS Web, NERIS Phase 1–2, and **future modules** inherit these controls by default. Module-specific addenda go in this matrix; do not fork a separate SOC program per module.
