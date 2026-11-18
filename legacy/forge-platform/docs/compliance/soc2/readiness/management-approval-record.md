# Management Approval Record — SOC 2 Readiness

**Document ID:** SOC2-APR-001  
**Version:** 0.1  
**Status:** APPROVED  
**Prepared:** 2026-07-26  
**Prepared by:** SOC 2 readiness program (Engineering / Compliance documentation)

> This record is prepared for human approval. **Do not treat any section as approved** until Jeremy Powell (or a formally delegated approver) records an explicit Decision of `APPROVED` with date and signature/initials in the table below. Git commits are not approval.

**Approver (required):** Jeremy Powell — Founder, Forge Public Safety

**Next review date (proposed):** 2027-01-26 (or after material system-boundary change)

---

## How to approve

For each Approval ID row:

1. Review the linked document version.
2. Set **Decision** to `APPROVED`, `APPROVED_WITH_CONDITIONS`, or `REJECTED`.
3. Fill **Date**, **Conditions**, **Exceptions**, and sign/initial.
4. Do not approve if you intend to change Trust Services Categories without updating `scope/trust-services-category-decision.md`.

---

## Approval sections

### APR-001 — SOC 2 system boundary

| Field            | Value                        |
| ---------------- | ---------------------------- |
| Approval ID      | APR-001                      |
| Document         | `scope/system-boundary.md`   |
| Document version | 0.1 (draft)                  |
| Approver         | Jeremy Powell                |
| Approver role    | Founder, Forge Public Safety |
| Decision         | `APPROVED`                   |
| Date             | 7/26/2026                    |
| Conditions       |                              |
| Exceptions       |                              |
| Next review date | 2027-01-26                   |

### APR-002 — Included services

| Field            | Value                        |
| ---------------- | ---------------------------- |
| Approval ID      | APR-002                      |
| Document         | `scope/in-scope-services.md` |
| Document version | 0.1 (draft)                  |
| Approver         | Jeremy Powell                |
| Approver role    | Founder, Forge Public Safety |
| Decision         | `APPROVED`                   |
| Date             | 7/26/2026                    |
| Conditions       |                              |
| Exceptions       |                              |
| Next review date | 2027-01-26                   |

### APR-003 — Excluded services

| Field            | Value                            |
| ---------------- | -------------------------------- |
| Approval ID      | APR-003                          |
| Document         | `scope/out-of-scope-services.md` |
| Document version | 0.1 (draft)                      |
| Approver         | Jeremy Powell                    |
| Approver role    | Founder, Forge Public Safety     |
| Decision         | `APPROVED`                       |
| Date             | 7/26/2026                        |
| Conditions       |                                  |
| Exceptions       | NERIS Phase 3 remains excluded   |
| Next review date | 2027-01-26                       |

### APR-004 — Included environments

| Field            | Value                                                                                                          |
| ---------------- | -------------------------------------------------------------------------------------------------------------- |
| Approval ID      | APR-004                                                                                                        |
| Document         | `scope/environments.md`                                                                                        |
| Document version | 0.1 (draft)                                                                                                    |
| Approver         | Jeremy Powell                                                                                                  |
| Approver role    | Founder, Forge Public Safety                                                                                   |
| Decision         | `APPROVED`                                                                                                     |
| Date             | 7/26/2026                                                                                                      |
| Conditions       | Development account `511343547817` is the current system of record until a dedicated production account exists |
| Exceptions       |                                                                                                                |
| Next review date | 2027-01-26                                                                                                     |

### APR-005 — Trust Services Category decisions

| Field            | Value                                                                                                                                                                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Approval ID      | APR-005                                                                                                                                                                                                                               |
| Document         | `scope/trust-services-category-decision.md`                                                                                                                                                                                           |
| Document version | 0.1 (draft)                                                                                                                                                                                                                           |
| Approver         | Jeremy Powell                                                                                                                                                                                                                         |
| Approver role    | Founder, Forge Public Safety                                                                                                                                                                                                          |
| Decision         | `APPROVED`                                                                                                                                                                                                                            |
| Date             | 7/26/2026                                                                                                                                                                                                                             |
| Conditions       | Security, Availability, Confidentiality **INCLUDED**; Processing Integrity **DEFERRED**; Privacy **DEFERRED**. Changing categories requires reason, risk impact, approver, effective date, related controls, and additional evidence. |
| Exceptions       |                                                                                                                                                                                                                                       |
| Next review date | 2027-01-26                                                                                                                                                                                                                            |

### APR-006 — Risk methodology

| Field            | Value                                 |
| ---------------- | ------------------------------------- |
| Approval ID      | APR-006                               |
| Document         | `risk/risk-assessment-methodology.md` |
| Document version | 0.1 (draft)                           |
| Approver         | Jeremy Powell                         |
| Approver role    | Founder, Forge Public Safety          |
| Decision         | `APPROVED`                            |
| Date             | 7/26/2026                             |
| Conditions       |                                       |
| Exceptions       |                                       |
| Next review date | 2027-01-26                            |

### APR-007 — Data classification model

| Field            | Value                                                    |
| ---------------- | -------------------------------------------------------- |
| Approval ID      | APR-007                                                  |
| Document         | `policies/data-classification-policy.md` (SOC2-POL-009)  |
| Document version | 0.1                                                      |
| Approver         | Jeremy Powell                                            |
| Approver role    | Founder, Forge Public Safety                             |
| Decision         | `APPROVED`                                               |
| Date             | 7/26/2026                                                |
| Conditions       | Data classification policy APPROVED effective 2026-07-26 |
| Exceptions       |                                                          |
| Next review date | 2027-01-26                                               |

### APR-008 — Control ownership model

| Field            | Value                                                                       |
| ---------------- | --------------------------------------------------------------------------- |
| Approval ID      | APR-008                                                                     |
| Document         | `controls/control-owners.md`                                                |
| Document version | 0.2                                                                         |
| Approver         | Jeremy Powell                                                               |
| Approver role    | Founder, Forge Public Safety                                                |
| Decision         | `APPROVED`                                                                  |
| Date             | 7/26/2026                                                                   |
| Conditions       | Role-based operational owners accepted until named individuals are assigned |
| Exceptions       |                                                                             |
| Next review date | 2027-01-26                                                                  |

### APR-009 — Claims restriction

| Field            | Value                                                                                                                                                                                            |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Approval ID      | APR-009                                                                                                                                                                                          |
| Document         | `README.md` (claims boundary) + `policies/information-security-policy.md`                                                                                                                        |
| Document version | Program README + POL-001 v0.1                                                                                                                                                                    |
| Approver         | Jeremy Powell                                                                                                                                                                                    |
| Approver role    | Founder, Forge Public Safety                                                                                                                                                                     |
| Decision         | `APPROVED`                                                                                                                                                                                       |
| Date             | 7/26/2026                                                                                                                                                                                        |
| Conditions       | Forge must **not** claim SOC 2 certified, compliant, audited, Type 1 complete, or Type 2 complete. Allowed: “SOC 2 readiness program in progress” / “controls under development and validation.” |
| Exceptions       | None                                                                                                                                                                                             |
| Next review date | 2027-01-26                                                                                                                                                                                       |

### APR-010 — Phase 1 infrastructure authorization (CloudTrail)

| Field            | Value                                                                                                                                                                                                                                                               |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Approval ID      | APR-010                                                                                                                                                                                                                                                             |
| Document         | This record + CloudTrail CDK design in Phase 1 completion report                                                                                                                                                                                                    |
| Document version | Phase 1                                                                                                                                                                                                                                                             |
| Approver         | Jeremy Powell                                                                                                                                                                                                                                                       |
| Approver role    | Founder, Forge Public Safety                                                                                                                                                                                                                                        |
| Decision         | `APPROVED`                                                                                                                                                                                                                                                          |
| Date             | 7/26/2026                                                                                                                                                                                                                                                           |
| Conditions       | Authorizes CDK-managed account-level CloudTrail for the development environment after OD-21 inspection (no existing trails). Does **not** authorize GuardDuty/Security Hub, multi-region DR, or NERIS Phase 3. Object Lock not enabled without separate evaluation. |
| Exceptions       | Org-delegated CloudTrail deferred                                                                                                                                                                                                                                   |
| Next review date | 2027-01-26                                                                                                                                                                                                                                                          |

---

## Blanket signature block (optional once all rows approved)

| Field                | Value                        |
| -------------------- | ---------------------------- |
| Approver name        | Jeremy Powell                |
| Approver role        | Founder, Forge Public Safety |
| Overall decision     | `APPROVED`                   |
| Signature / initials | JP                           |
| Date                 | 7/26/2026                    |

---

## Revision history

| Version | Date       | Change                                                         |
| ------- | ---------- | -------------------------------------------------------------- |
| 0.1     | 2026-07-26 | Initial Phase 1 approval packet prepared for human signature   |
| 0.2     | 2026-07-26 | Approved by Jeremy Powell (APR-001–010 + blanket signature JP) |
