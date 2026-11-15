# Compensating Controls

**Document ID:** SOC2-CTL-004  
**Version:** 0.1 (draft)  
**Date:** 2026-07-26

Compensating controls are temporary or alternative activities that reduce risk when a primary control is missing or partial. They are **not** a substitute for closing material gaps indefinitely.

| Comp ID | Related risk / gap | Primary control missing        | Compensating activity                                             | Limitations                                                                                   | Expiry review             |
| ------- | ------------------ | ------------------------------ | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------- |
| CMP-001 | R-002 / CC-LOG-01  | CloudTrail (primary operating) | **Retired 2026-07-26** — primary control ACCEPTED                 | Residual: org-trail strategy still deferred; SNS alarm subscribers placeholder in development | Closed with R-002         |
| CMP-002 | R-007 / CC-MON-02  | GuardDuty / Security Hub       | CloudWatch alarms on API/ECS/DB; app audit review on incidents    | Limited threat intel / account-level anomaly detection                                        | Quarterly                 |
| CMP-003 | R-005 / A-AVL-03   | Formal restore drills          | Aurora snapshot existence checks; manual restore knowledge in eng | Unproven RTO/RPO                                                                              | Until first restore drill |
| CMP-004 | R-008 / A-AVL-04   | WAF                            | CloudFront + security groups + rate limits if any at app          | Weaker L7 abuse protection                                                                    | When WAF decision made    |

When a primary control becomes **Operating**, retire the compensating row and archive evidence of closure.
