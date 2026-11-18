# Trust Services Category Decision

**Document ID:** SOC2-SCOPE-007  
**Version:** 0.1 (draft)  
**Date:** 2026-07-26  
**Status:** Draft — requires management + auditor confirmation

---

## Decision rule

Do **not** include a Trust Services Category merely because it sounds desirable. Inclusion requires:

1. Material customer expectations or contractual need.
2. Controllable processes Forge can operate and evidence.
3. Willingness to sustain the category for an examination period.

---

## Category dispositions

### Security (Common Criteria) — **INCLUDED**

| Factor               | Assessment                                                                             |
| -------------------- | -------------------------------------------------------------------------------------- |
| Customer expectation | High — multi-tenant public-safety SaaS                                                 |
| Existing controls    | Strong technical base (Cognito, RLS, KMS, CI scans, audit events)                      |
| Gaps                 | CloudTrail, formal policies/procedures, access review cadence, some detection services |
| Decision             | **In scope for readiness**                                                             |

### Availability — **INCLUDED**

| Factor               | Assessment                                                                                    |
| -------------------- | --------------------------------------------------------------------------------------------- |
| Customer expectation | High — operational continuity for agency workflows                                            |
| Existing controls    | Multi-AZ capable Aurora/ECS patterns, CloudWatch, CloudFront; backup flagged for verification |
| Gaps                 | Formal BCP/DR, RTO/RPO, restore tests, incident severity for outages                          |
| Decision             | **In scope for readiness**                                                                    |

### Confidentiality — **INCLUDED**

| Factor               | Assessment                                                                            |
| -------------------- | ------------------------------------------------------------------------------------- |
| Customer expectation | High — tenant isolation and sensitive operational data                                |
| Existing controls    | FORCE RLS, `forge_app`, encryption design, tenant membership, Phase 2 isolation tests |
| Gaps                 | Formal confidentiality policy, data classification ops, DLP evaluation                |
| Decision             | **In scope for readiness**                                                            |

### Processing Integrity — **DEFERRED (evaluate later)**

| Factor           | Assessment                                                                                                                                                                                                                                                                       |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Why considered   | Incident records and NERIS-related processing accuracy matter operationally                                                                                                                                                                                                      |
| Why deferred     | PI criteria emphasize completeness, accuracy, timeliness of **processing** with formal QA controls; Forge’s near-term readiness should stabilize Security/Availability/Confidentiality first. Application validation exists but is not yet framed as a sustained PI control set. |
| Path back in     | After Security/Confidentiality evidence is stable; with product-defined accuracy SLAs and automated integrity tests tied to procedures                                                                                                                                           |
| Auditor guidance | **Recommended** before marketing any PI commitment                                                                                                                                                                                                                               |
| Decision         | **Deferred** — not in initial examination target                                                                                                                                                                                                                                 |

### Privacy — **DEFERRED pending external guidance**

| Factor            | Assessment                                                                                                                                                                                                  |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Why considered    | Cognito identity and operational records can contain PII                                                                                                                                                    |
| Why deferred      | AICPA Privacy criteria are distinct from Confidentiality; require privacy notice, data subject rights processes, and often legal counsel. Including Privacy without those programs creates false readiness. |
| Existing coverage | Confidentiality + Security address unauthorized disclosure; development data policy exists                                                                                                                  |
| Path back in      | After privacy counsel, notices, DSAR process, and retention/deletion procedures                                                                                                                             |
| Auditor guidance  | **Required** before including Privacy                                                                                                                                                                       |
| Decision          | **Deferred** — seek counsel/auditor guidance; do not claim Privacy category                                                                                                                                 |

---

## Summary table

| Category             | Disposition | Notes                                    |
| -------------------- | ----------- | ---------------------------------------- |
| Security             | **Include** | Foundation                               |
| Availability         | **Include** | Foundation                               |
| Confidentiality      | **Include** | Foundation                               |
| Processing Integrity | **Defer**   | Revisit post-foundation; auditor input   |
| Privacy              | **Defer**   | External legal/auditor guidance required |

---

## Prohibited language until examination

Regardless of category inclusion above, Forge must not claim SOC 2 certified, compliant, audited, Type 1 complete, or Type 2 complete.

---

## Approval

| Approver | Role                  | Decision | Date |
| -------- | --------------------- | -------- | ---- |
| _TBD_    | Executive sponsor     |          |      |
| _TBD_    | Security / compliance |          |      |
| _TBD_    | Product               |          |      |
