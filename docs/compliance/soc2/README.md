# Forge Public Safety — SOC 2 Readiness Program

**Status:** Phase 1 **COMPLETE** (management approved 2026-07-26) — readiness program continues; not a SOC 2 certification claim  
**Program start:** 2026-07-26  
**Phase 1 report:** [`readiness/soc2-phase-1-completion-report.md`](readiness/soc2-phase-1-completion-report.md)  
**NERIS Phase 2:** Technically accepted (see [`docs/neris/phase-2-final-acceptance-report.md`](../../neris/phase-2-final-acceptance-report.md))  
**NERIS Phase 3:** Out of scope — do not begin without a separate directive

---

## Important claims boundary

This program **does not** authorize Forge to claim any of the following:

- SOC 2 certified
- SOC 2 compliant
- SOC 2 audited
- SOC 2 Type 1 complete
- SOC 2 Type 2 complete

Until an independent CPA examination is complete and a report is issued, public and customer language must be limited to factual descriptions such as:

> “Forge is executing a SOC 2 readiness program aligned to the AICPA Trust Services Criteria.”

---

## Purpose

1. Define the Forge SOC 2 **system boundary**.
2. Map technical and operational controls to the Trust Services Criteria (TSC).
3. Close material control gaps.
4. Establish repeatable operating procedures.
5. Automate evidence collection where practical.
6. Prepare for a future independent readiness assessment and CPA examination.
7. Ensure future Forge modules inherit the same security-control foundation.

---

## Initial Trust Services Categories

| Category                 | Initial posture                         | Detail                                                                                       |
| ------------------------ | --------------------------------------- | -------------------------------------------------------------------------------------------- |
| **Security**             | **In scope**                            | Required foundation                                                                          |
| **Availability**         | **In scope**                            | Public safety SaaS continuity expectations                                                   |
| **Confidentiality**      | **In scope**                            | Multi-tenant public-safety operational data                                                  |
| **Processing Integrity** | **Evaluate / likely deferred**          | See [`scope/trust-services-category-decision.md`](scope/trust-services-category-decision.md) |
| **Privacy**              | **Evaluate / deferred pending counsel** | PII exists; formal Privacy criteria need legal/auditor guidance                              |

Do not expand categories without updating the category decision record and re-baselining scope.

---

## Directory map

```text
docs/compliance/soc2/
├── README.md                          ← this file
├── scope/                             ← system boundary and TSC decisions
├── risk/                              ← methodology and registers
├── controls/                          ← control matrix, owners, testing
├── policies/                          ← approved organizational policies
├── procedures/                        ← how controls are operated
├── evidence/                          ← collected artifacts (no secrets)
├── vendors/                           ← subservice / vendor diligence
├── training/                          ← security awareness curriculum
├── incidents/                         ← incident response records
├── business-continuity/               ← BCP / DR
├── access-reviews/                    ← periodic access attestation
├── change-management/                 ← change records / CAB notes
└── readiness/                         ← readiness assessment artifacts
```

---

## Operating principles

1. **Preserve working controls.** Do not replace Aurora FORCE RLS, `forge_app`, Cognito, CloudFront, KMS, or audit paths merely to rename them for SOC 2.
2. **Prove operation.** Each control must be identified, tested for actual operation, and linked to policy + evidence.
3. **No secrets in evidence.** Credentials, tokens, and raw PII do not belong in this tree. Use redacted samples and pointers to secure stores.
4. **Module inheritance.** Creator Console, RMS Web, NERIS, and future products inherit this control foundation unless explicitly scoped out.
5. **Auditor-neutral language.** Prefer “control activity,” “evidence,” and “exception” over marketing claims.

---

## Sprint sequencing (high level)

| Phase                       | Focus                                               | Gate                             |
| --------------------------- | --------------------------------------------------- | -------------------------------- |
| **0 — Structure**           | This tree + scope/risk/controls skeletons           | Complete before infra/app change |
| **1 — Gap closure**         | CloudTrail and other material gaps; policy drafts   | Control owners assigned          |
| **2 — Procedures**          | Runbooks mapped to controls; access/change cadences | Procedures approved              |
| **3 — Evidence automation** | Scripts / CI artifacts into `evidence/`             | Sample period dry-run            |
| **4 — Readiness package**   | Self-assessment + CPA engagement prep               | External readiness review        |

---

## Related Forge references (existing)

| Topic                  | Path                                                           |
| ---------------------- | -------------------------------------------------------------- |
| Tenant isolation / RLS | `docs/security/tenant-isolation.md`, ADR-012, ADR-014, ADR-029 |
| Authorization          | `docs/architecture/authorization.md`, ADR-015                  |
| Audit logging          | `docs/security/audit-logging.md`                               |
| Encryption             | `docs/security/encryption-design.md`, ADR-018                  |
| IAM                    | `docs/security/iam-design.md`                                  |
| Network                | `docs/security/network-security-design.md`                     |
| Development data       | `docs/security/development-data-policy.md`                     |
| Security gaps          | `docs/discovery/security-gap-analysis.md`                      |
| Infra inventory        | `docs/operations/development-infrastructure-inventory.md`      |
| Phase 2 acceptance     | `docs/neris/phase-2-final-acceptance-report.md`                |

---

## Document control

| Field          | Value                                                              |
| -------------- | ------------------------------------------------------------------ |
| Owner          | Engineering lead (interim) — assign Compliance owner               |
| Classification | Internal — Compliance                                              |
| Review cadence | Quarterly, and after material system changes                       |
| Next action    | Complete Phase 0 scope/risk/controls drafts; assign control owners |
