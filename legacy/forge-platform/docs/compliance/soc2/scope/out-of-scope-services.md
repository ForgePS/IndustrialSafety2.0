# Out-of-Scope Services and Components

**Document ID:** SOC2-SCOPE-003  
**Version:** 0.1 (draft)  
**Date:** 2026-07-26

Items listed here are **not** part of the current Forge SOC 2 system description unless a formal scope change brings them in.

---

## 1. Product / delivery exclusions

| Item                                                  | Rationale                                               |
| ----------------------------------------------------- | ------------------------------------------------------- |
| NERIS Phase 3 and later                               | Explicitly not authorized this sprint; Phase 2 accepted |
| Unreleased experimental features                      | Not customer-facing; not in operating system            |
| Marketing websites not served by Forge platform infra | Separate systems if any                                 |

---

## 2. Customer-controlled environments

| Item                                                                                     | Rationale                       |
| ---------------------------------------------------------------------------------------- | ------------------------------- |
| Agency workstations, browsers, mobile devices                                            | Customer responsibility         |
| Agency identity providers not integrated as Forge Cognito federation (if any future IdP) | Until contractually in scope    |
| On-premises CAD / RMS / records systems outside Forge hosting                            | Customer or third-party systems |
| Customer email systems used for notifications                                            | Subservice or customer          |

---

## 3. Corporate / non-product systems (until scoped)

| Item                                                                | Rationale                                                                     |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Corporate email, HRIS, finance systems                              | Not part of product system boundary                                           |
| Personal developer machines (beyond secure-SDLC expectations)       | Covered via policy/procedure, not as “system components”                      |
| Third-party SaaS used only for internal collaboration (Slack, etc.) | Vendor diligence may still apply; not in product TSC description until listed |

---

## 4. AWS services not currently operated as Forge controls

The following may appear in CDK config flags or open decisions but are **not** claimed as operating in-scope controls until implemented, tested, and evidenced:

| Service / capability                   | Notes                                                                          |
| -------------------------------------- | ------------------------------------------------------------------------------ |
| AWS CloudTrail (account trail)         | OD-21 — not implemented; treated as **material gap**, not an operating control |
| Amazon GuardDuty                       | Config flagged / unwired — not claimed                                         |
| AWS Security Hub                       | Config flagged / unwired — not claimed                                         |
| Amazon Macie                           | Config flagged / unwired — not claimed                                         |
| Amazon Inspector                       | Config flagged / unwired — not claimed                                         |
| AWS WAF (if disabled in environment)   | Only in-scope when enabled and monitored                                       |
| AWS Backup (if not verified operating) | Confirm before claiming availability control                                   |

---

## 5. Examination / certification artifacts

| Item                                        | Rationale                             |
| ------------------------------------------- | ------------------------------------- |
| SOC 2 Type 1 / Type 2 report                | Does not exist yet                    |
| Independent CPA opinion                     | Future engagement                     |
| Customer-facing “SOC 2 compliant” marketing | Prohibited until examination complete |

---

## 6. Scope change process

To move an item from out-of-scope to in-scope:

1. Update `system-boundary.md` and this file.
2. Update control matrix and risk register.
3. Obtain management approval.
4. Ensure evidence and procedures exist before claiming the control operates.
