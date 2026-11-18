# Risk Register

**Document ID:** SOC2-RISK-004  
**Version:** 0.2  
**Date:** 2026-07-26

Scoring per [`risk-assessment-methodology.md`](risk-assessment-methodology.md). Scores are initial engineering estimates pending formal workshop.

Status values for remediation tracking include: `OPEN` | `REMEDIATION_IN_PROGRESS` | `REMEDIATED_PENDING_VALIDATION` | `CLOSED`.

| Risk ID | Risk statement                                                 | Threats      | L   | I   | Score | Rating | Treatment                                                                                                               | Linked controls     | Status                   |
| ------- | -------------------------------------------------------------- | ------------ | --- | --- | ----- | ------ | ----------------------------------------------------------------------------------------------------------------------- | ------------------- | ------------------------ |
| R-001   | Tenant isolation fails due to BYPASSRLS or missing RLS context | T-001        | 2   | 5   | 10    | High   | Mitigate — keep `forge_app`, FORCE RLS, CI RLS tests, Phase 2 isolation suite                                           | CC-ISO-01..04       | Mitigating / monitor     |
| R-002   | AWS API activity not reconstructable (no CloudTrail)           | T-004, T-010 | 1   | 3   | 3     | Low    | Mitigate — account multi-region CloudTrail deployed via CDK `ForgeAudit`; evidence ACCEPTED 2026-07-26 by Jeremy Powell | CC-LOG-01           | **CLOSED**               |
| R-003   | Privileged access not periodically reviewed                    | T-004, T-008 | 3   | 4   | 12    | High   | Mitigate — access review procedure                                                                                      | CC-ACC-03           | Open                     |
| R-004   | Secrets committed or logged                                    | T-002        | 2   | 5   | 10    | High   | Mitigate — gitleaks, Secrets Manager, no secrets in evidence/                                                           | CC-SEC-01, CC-CI-02 | Operating / monitor      |
| R-005   | Prolonged outage without tested restore                        | T-006, T-007 | 3   | 4   | 12    | High   | Mitigate — verify backup, restore drill, BCP                                                                            | A-AVL-01..03        | Partial                  |
| R-006   | Unauthorized production change                                 | T-005        | 2   | 4   | 8     | Medium | Mitigate — PR review, CI gates, change log                                                                              | CC-CHG-01..03       | Operating / formalize    |
| R-007   | Detection gap (GuardDuty/Security Hub unwired)                 | T-004, T-010 | 3   | 3   | 9     | Medium | Mitigate or accept with compensating CloudWatch/audit                                                                   | CC-MON-02           | Open                     |
| R-008   | Edge abuse / DoS without WAF                                   | T-012        | 3   | 3   | 9     | Medium | Evaluate WAF enablement                                                                                                 | A-AVL-04            | Open                     |
| R-009   | Formal policies/procedures missing for examination             | T-010        | 4   | 3   | 12    | High   | Mitigate — policy pack this program                                                                                     | CC-GOV-01           | Open (program work)      |
| R-010   | Customer overclaim of SOC 2 status                             | —            | 3   | 4   | 12    | High   | Mitigate — claims boundary in README; training                                                                          | CC-GOV-02           | Operating (docs)         |
| R-011   | Dependency / CI supply chain compromise                        | T-009        | 2   | 4   | 8     | Medium | Mitigate — pin/review Actions, dependency policy                                                                        | CC-CI-01            | Partial                  |
| R-012   | Admin DB role used by runtime again                            | T-001, T-008 | 2   | 5   | 10    | High   | Mitigate — app secret in task def; periodic verify                                                                      | CC-ISO-02           | Closed Phase 2 / monitor |
| R-013   | Incomplete incident response readiness                         | T-010        | 3   | 4   | 12    | High   | Mitigate — IR procedure + tabletop                                                                                      | CC-IR-01            | Open                     |
| R-014   | Subservice (AWS/GitHub) report not reviewed                    | —            | 3   | 2   | 6     | Medium | Mitigate — annual Artifact/GitHub review                                                                                | CC-VEN-01           | Open                     |

---

## Material gaps (priority)

1. **R-003 / R-013** — Access review cadence + incident response operating maturity
2. **R-005** — Backup/restore evidence for Availability
3. **R-009** — Policy pack APPROVED; sustain operating procedures in practice

Do not begin NERIS Phase 3 as a treatment for these risks.

### Revision history

| Version | Date       | Change                                                                          |
| ------- | ---------- | ------------------------------------------------------------------------------- |
| 0.1     | 2026-07-26 | Phase 0 initial register                                                        |
| 0.2     | 2026-07-26 | Phase 1 CloudTrail remediation; R-002 residual score reduced pending validation |
| 0.3     | 2026-07-26 | R-002 CLOSED — evidence ACCEPTED; policies APPROVED by Jeremy Powell            |
