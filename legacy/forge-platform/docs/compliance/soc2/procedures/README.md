# Procedures

Phase 1 operating procedures. Status: **APPROVED** (effective 2026-07-26).

| ID            | Procedure                                                           | Frequency highlight                                                  |
| ------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------- |
| SOC2-PROC-001 | [User onboarding](user-onboarding.md)                               | Weekly as requests arrive; within 1 business day of approval         |
| SOC2-PROC-002 | [User role modification](user-role-modification.md)                 | Within 1 business day of approval                                    |
| SOC2-PROC-003 | [User termination](user-termination.md)                             | Same business day for privileged; within 1 business day otherwise    |
| SOC2-PROC-004 | [Privileged access approval](privileged-access-approval.md)         | Before granting; no standing undocumented privilege                  |
| SOC2-PROC-005 | [Emergency access](emergency-access.md)                             | Only during declared incident; expires ≤ 24 hours unless re-approved |
| SOC2-PROC-006 | [Quarterly access review](quarterly-access-review.md)               | Once per calendar quarter                                            |
| SOC2-PROC-007 | [Production change approval](production-change-approval.md)         | Every production-bound change                                        |
| SOC2-PROC-008 | [Emergency change](emergency-change.md)                             | During incident; retrospective PR within 2 business days             |
| SOC2-PROC-009 | [Vulnerability triage](vulnerability-triage.md)                     | Critical ≤ 1 business day; High ≤ 5; Medium ≤ 30                     |
| SOC2-PROC-010 | [Security alert review](security-alert-review.md)                   | Business-hours: 4 hours; after-hours Sev-1 path per IR               |
| SOC2-PROC-011 | [Incident declaration](incident-declaration.md)                     | Immediate upon criteria met                                          |
| SOC2-PROC-012 | [Incident evidence preservation](incident-evidence-preservation.md) | Within 1 hour of declaration                                         |
| SOC2-PROC-013 | [Backup verification](backup-verification.md)                       | Monthly                                                              |
| SOC2-PROC-014 | [Restore testing](restore-testing.md)                               | At least twice per year                                              |
| SOC2-PROC-015 | [Policy review](policy-review.md)                                   | At least annually                                                    |
| SOC2-PROC-016 | [Control exception approval](control-exception-approval.md)         | Before exception takes effect                                        |
| SOC2-PROC-017 | [Support access authorization](support-access-authorization.md)     | Per ticket; max duration 8 hours default                             |
| SOC2-PROC-018 | [Support access expiration](support-access-expiration.md)           | At expiry; verify within 1 hour                                      |
| SOC2-PROC-019 | [CloudTrail review](cloudtrail-review.md)                           | Weekly sample review; full export monthly via evidence scripts       |
