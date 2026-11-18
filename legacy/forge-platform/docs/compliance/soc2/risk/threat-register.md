# Threat Register

**Document ID:** SOC2-RISK-003  
**Version:** 0.1 (draft)  
**Date:** 2026-07-26

| Threat ID | Threat                               | Category                        | Related assets      | Notes                                   |
| --------- | ------------------------------------ | ------------------------------- | ------------------- | --------------------------------------- |
| T-001     | Cross-tenant data access             | Confidentiality                 | A-001, A-004, A-018 | RLS bypass, wrong DB role, authz bug    |
| T-002     | Credential / secret leakage          | Confidentiality / Security      | A-008, A-011, A-012 | Repo secrets, log leakage               |
| T-003     | Account takeover (Cognito user)      | Security                        | A-005               | Weak auth, session theft                |
| T-004     | Privileged AWS misuse                | Security                        | A-014, A-015        | Overbroad IAM, no CloudTrail            |
| T-005     | Unauthorized infrastructure change   | Security / Integrity            | A-015, A-004        | Deploy without review                   |
| T-006     | Service outage (region / dependency) | Availability                    | A-004, A-001, A-006 | AWS or app failure                      |
| T-007     | Ransomware / destructive change      | Availability / Confidentiality  | A-001, A-003        | Backup gaps                             |
| T-008     | Insider misuse of admin tools        | Confidentiality                 | A-017, A-014        | Creator Console / DB admin              |
| T-009     | Supply-chain compromise (deps/CI)    | Security                        | A-011, A-012        | Malicious package / workflow            |
| T-010     | Insufficient audit trail             | Security                        | A-010, A-013        | Cannot investigate incidents            |
| T-011     | Encryption misconfiguration          | Confidentiality                 | A-007, A-001, A-003 | Cleartext or wrong key policy           |
| T-012     | Denial of service at edge            | Availability                    | A-006               | No WAF / rate limits                    |
| T-013     | PII over-collection / retention      | Privacy (deferred)              | A-005, A-001        | Track even if Privacy category deferred |
| T-014     | Processing errors in incident data   | Processing Integrity (deferred) | A-018, A-016        | Accuracy/completeness                   |

Threats T-013 and T-014 remain monitored under Security/Confidentiality/Availability treatments until those categories are formally included.
