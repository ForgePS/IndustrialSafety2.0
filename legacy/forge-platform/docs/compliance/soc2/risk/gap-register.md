# Gap Register

**Document ID:** SOC2-GAP-001  
**Version:** 0.2  
**Date:** 2026-07-26

| Gap ID  | Related risk / control | Description                                | Status     | Notes                                                                                                                                                                                          |
| ------- | ---------------------- | ------------------------------------------ | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GAP-001 | R-002 / CC-LOG-01      | CloudTrail not implemented                 | **CLOSED** | Deployed + evidence ACCEPTED 2026-07-26 by Jeremy Powell                                                                                                                                       |
| GAP-002 | R-009                  | Formal policies missing                    | **CLOSED** | 15 policies APPROVED 2026-07-26                                                                                                                                                                |
| GAP-003 | R-003 / CC-ACC-03      | Quarterly access reviews not operating     | OPEN       | Initial inventory approved as baseline; quarterly cadence still to operate                                                                                                                     |
| GAP-004 | R-013 / CC-IR-01       | Incident response program not operating    | PARTIAL    | Policy + procedures APPROVED; first tabletop still required                                                                                                                                    |
| GAP-005 | R-005 / A-AVL-03       | Restore testing not evidenced              | OPEN       | Procedure drafted; drill not run                                                                                                                                                               |
| GAP-006 | R-007 / CC-MON-02      | GuardDuty / Security Hub unwired           | OPEN       | Out of Phase 1 scope unless separately authorized                                                                                                                                              |
| GAP-007 | —                      | S3 Object Lock on CloudTrail bucket        | DEFERRED   | Not enabled — see evaluation below                                                                                                                                                             |
| GAP-008 | —                      | CloudTrail data events on all buckets      | DEFERRED   | Targeted WriteOnly on documents/exports/audit only                                                                                                                                             |
| GAP-009 | —                      | Data stack CDK drift vs Phase 2 app secret | **CLOSED** | Strategy A import-by-name deployed; CDK no-changes + stack UPDATE_COMPLETE 2026-07-27; secret ARN/LastChangedDate unchanged — see `docs/infrastructure/gap-009-final-reconciliation-report.md` |
| GAP-010 | R-008 / A-AVL-04       | WAF enablement verification                | OPEN       | Config flag true; confirm operating evidence                                                                                                                                                   |

## Object Lock evaluation (GAP-007)

| Factor                   | Assessment                                                                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| Retention requirement    | Development audit retention currently 90 days (config); Object Lock compliance mode would block deletes even for operational cleanup |
| Operational consequences | Broken deploys / mistaken configs harder to remediate; CDK DESTROY paths blocked                                                     |
| Cost                     | Higher storage + management complexity                                                                                               |
| Deletion restrictions    | Even account root constrained in compliance mode                                                                                     |
| Recovery procedure       | Would need legal hold / retention period design                                                                                      |
| Decision                 | **Do not enable** Object Lock in development without separate approval                                                               |

## Data events evaluation (GAP-008)

| Target                              | Decision                | Rationale                                                     |
| ----------------------------------- | ----------------------- | ------------------------------------------------------------- |
| documents / exports / audit buckets | **Enabled** WriteOnly   | High-value Confidential objects; volume bounded vs all-bucket |
| imports / app-assets                | Deferred                | Lower sensitivity relative to cost                            |
| All-bucket object-level             | Deferred                | High volume/cost; retention impact                            |
| Secrets Manager                     | Deferred as data events | Management events already capture many Secrets Manager APIs   |

## Revision history

| Version | Date       | Change                                                          |
| ------- | ---------- | --------------------------------------------------------------- |
| 0.1     | 2026-07-26 | Phase 0 material gaps listed in risk register                   |
| 0.2     | 2026-07-26 | Phase 1 CloudTrail remediation + deferred evaluations           |
| 0.3     | 2026-07-26 | GAP-001/002 closed on management approval + evidence acceptance |
