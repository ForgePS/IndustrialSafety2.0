# Risk Assessment Methodology

**Document ID:** SOC2-RISK-001  
**Version:** 0.1 (draft)  
**Date:** 2026-07-26

---

## 1. Purpose

Define how Forge identifies, analyzes, treats, and monitors risks affecting the in-scope system for Security, Availability, and Confidentiality.

---

## 2. Scope of assessment

- Assets in [`asset-register.md`](asset-register.md)
- Threats in [`threat-register.md`](threat-register.md)
- Risks in [`risk-register.md`](risk-register.md)
- Acceptances in [`risk-acceptance-register.md`](risk-acceptance-register.md)

Aligned to the system boundary in `../scope/system-boundary.md`.

---

## 3. Cadence

| Activity                      | Frequency                                                                                            |
| ----------------------------- | ---------------------------------------------------------------------------------------------------- |
| Full risk assessment refresh  | At least annually                                                                                    |
| Triggered reassessment        | Material architecture change, major incident, new product module in-scope, significant vendor change |
| Risk register review          | Quarterly                                                                                            |
| Risk acceptance expiry review | Per acceptance end date (default ≤ 12 months)                                                        |

---

## 4. Impact and likelihood scales

### Likelihood (1–5)

| Score | Meaning                                  |
| ----- | ---------------------------------------- |
| 1     | Rare — not expected in 24 months         |
| 2     | Unlikely                                 |
| 3     | Possible — may occur within 12–24 months |
| 4     | Likely                                   |
| 5     | Almost certain / continuous exposure     |

### Impact (1–5)

| Score | Confidentiality                      | Availability               | Integrity / trust                       |
| ----- | ------------------------------------ | -------------------------- | --------------------------------------- |
| 1     | Negligible                           | Brief cosmetic outage      | No customer impact                      |
| 2     | Limited internal                     | Degraded non-critical      | Minor data issue, correctable           |
| 3     | Single-tenant exposure risk          | Partial service outage     | Incorrect records requiring remediation |
| 4     | Multi-tenant or sensitive disclosure | Major outage               | Systemic incorrect processing           |
| 5     | Broad breach / regulatory crisis     | Prolonged platform failure | Loss of public trust / safety impact    |

### Risk score

`Score = Likelihood × Impact` (range 1–25)

| Score | Rating   | Default treatment expectation                |
| ----- | -------- | -------------------------------------------- |
| 1–4   | Low      | Monitor                                      |
| 5–9   | Medium   | Mitigate or accept with owner                |
| 10–16 | High     | Mitigate with timeline                       |
| 17–25 | Critical | Immediate mitigation or executive acceptance |

---

## 5. Treatment options

1. **Mitigate** — implement or strengthen control
2. **Transfer** — contractual / insurance / subservice (limited)
3. **Accept** — documented in risk-acceptance register with expiry
4. **Avoid** — remove feature or exposure

---

## 6. Linkage to controls

Each Medium+ risk must map to one or more control IDs in `../controls/control-matrix.md`, or an explicit acceptance.

---

## 7. Participants

| Role                           | Responsibility                     |
| ------------------------------ | ---------------------------------- |
| Risk owner (interim: Eng lead) | Maintain registers                 |
| Control owners                 | Confirm control operation          |
| Executive sponsor              | Accept High/Critical residual risk |
| All engineers                  | Report new threats/assets          |

---

## 8. Methodology sources (informative)

- AICPA Trust Services Criteria (security, availability, confidentiality)
- AWS Well-Architected (Security / Reliability pillars) as engineering guidance
- Existing Forge ADRs and `docs/security/*`
