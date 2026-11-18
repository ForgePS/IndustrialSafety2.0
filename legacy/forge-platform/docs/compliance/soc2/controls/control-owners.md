# Control Owners

**Document ID:** SOC2-CTL-002  
**Version:** 0.2  
**Date:** 2026-07-26  
**Status:** ROLE_ASSIGNED (Phase 1) — named individuals beyond executive pending hiring/assignment  
**Assignment date:** 2026-07-26

## Ownership model

| Field               | Meaning                                                                 |
| ------------------- | ----------------------------------------------------------------------- |
| `accountable_owner` | Accountable for control outcome (executive or role)                     |
| `operational_owner` | Executes the control day to day                                         |
| `evidence_owner`    | Collects and files evidence                                             |
| `backup_owner`      | Covers absence of operational owner                                     |
| `owner_status`      | `NAMED` \| `ROLE_ASSIGNED` \| `UNASSIGNED` \| `EXTERNAL_OWNER_REQUIRED` |
| `assignment_date`   | Date ownership row became effective                                     |
| `approval_status`   | `APPROVED` as of 2026-07-26 (management approval record signed)         |

**Named executive:** Jeremy Powell — Founder, Forge Public Safety — accountable for sponsorship, scope/TSC/policy approval, High/Critical risk acceptance, vendor-risk acceptance, and final readiness decisions.

Role-based owners are **not** named individuals. No Critical or High control may remain `UNASSIGNED`.

---

## Per-control ownership

| Control ID | Risk rating | accountable_owner       | operational_owner                    | evidence_owner                       | backup_owner                                      | owner_status                              | assignment_date | approval_status |
| ---------- | ----------- | ----------------------- | ------------------------------------ | ------------------------------------ | ------------------------------------------------- | ----------------------------------------- | --------------- | --------------- |
| CC-GOV-01  | High        | Jeremy Powell (Founder) | Security and Compliance Owner        | Security and Compliance Owner        | Engineering Lead                                  | NAMED (accountable) / ROLE_ASSIGNED (ops) | 2026-07-26      | APPROVED        |
| CC-GOV-02  | High        | Jeremy Powell (Founder) | Security and Compliance Owner        | Security and Compliance Owner        | Product Owner                                     | NAMED (accountable) / ROLE_ASSIGNED (ops) | 2026-07-26      | APPROVED        |
| CC-ACC-01  | High        | Jeremy Powell (Founder) | Identity and Access Management Owner | Identity and Access Management Owner | Application Security Owner                        | ROLE_ASSIGNED                             | 2026-07-26      | APPROVED        |
| CC-ACC-02  | High        | Jeremy Powell (Founder) | Application Security Owner           | Application Security Owner           | Database Owner                                    | ROLE_ASSIGNED                             | 2026-07-26      | APPROVED        |
| CC-ACC-03  | High        | Jeremy Powell (Founder) | Identity and Access Management Owner | Security and Compliance Owner        | Engineering Lead                                  | ROLE_ASSIGNED                             | 2026-07-26      | APPROVED        |
| CC-ACC-04  | High        | Jeremy Powell (Founder) | Identity and Access Management Owner | Identity and Access Management Owner | Human Resources or Personnel Administration Owner | ROLE_ASSIGNED                             | 2026-07-26      | APPROVED        |
| CC-ISO-01  | High        | Jeremy Powell (Founder) | Database Owner                       | Database Owner                       | Application Security Owner                        | ROLE_ASSIGNED                             | 2026-07-26      | APPROVED        |
| CC-ISO-02  | High        | Jeremy Powell (Founder) | Database Owner                       | AWS Infrastructure Owner             | Application Security Owner                        | ROLE_ASSIGNED                             | 2026-07-26      | APPROVED        |
| CC-ISO-03  | High        | Jeremy Powell (Founder) | Application Security Owner           | Application Security Owner           | Database Owner                                    | ROLE_ASSIGNED                             | 2026-07-26      | APPROVED        |
| CC-ISO-04  | Medium      | Jeremy Powell (Founder) | Application Security Owner           | Application Security Owner           | Engineering Lead                                  | ROLE_ASSIGNED                             | 2026-07-26      | APPROVED        |
| CC-CRY-01  | High        | Jeremy Powell (Founder) | AWS Infrastructure Owner             | AWS Infrastructure Owner             | Security and Compliance Owner                     | ROLE_ASSIGNED                             | 2026-07-26      | APPROVED        |
| CC-CRY-02  | High        | Jeremy Powell (Founder) | AWS Infrastructure Owner             | AWS Infrastructure Owner             | Application Security Owner                        | ROLE_ASSIGNED                             | 2026-07-26      | APPROVED        |
| CC-SEC-01  | High        | Jeremy Powell (Founder) | AWS Infrastructure Owner             | AWS Infrastructure Owner             | Database Owner                                    | ROLE_ASSIGNED                             | 2026-07-26      | APPROVED        |
| CC-SEC-02  | High        | Jeremy Powell (Founder) | Application Security Owner           | Engineering Lead                     | Security and Compliance Owner                     | ROLE_ASSIGNED                             | 2026-07-26      | APPROVED        |
| CC-CHG-01  | Medium      | Jeremy Powell (Founder) | Engineering Lead                     | Engineering Lead                     | Application Security Owner                        | ROLE_ASSIGNED                             | 2026-07-26      | APPROVED        |
| CC-CHG-02  | Medium      | Jeremy Powell (Founder) | Engineering Lead                     | Engineering Lead                     | Application Security Owner                        | ROLE_ASSIGNED                             | 2026-07-26      | APPROVED        |
| CC-CHG-03  | Medium      | Jeremy Powell (Founder) | AWS Infrastructure Owner             | AWS Infrastructure Owner             | Engineering Lead                                  | ROLE_ASSIGNED                             | 2026-07-26      | APPROVED        |
| CC-CI-01   | Medium      | Jeremy Powell (Founder) | Engineering Lead                     | Engineering Lead                     | Application Security Owner                        | ROLE_ASSIGNED                             | 2026-07-26      | APPROVED        |
| CC-CI-02   | High        | Jeremy Powell (Founder) | Engineering Lead                     | Engineering Lead                     | Application Security Owner                        | ROLE_ASSIGNED                             | 2026-07-26      | APPROVED        |
| CC-LOG-01  | High        | Jeremy Powell (Founder) | AWS Infrastructure Owner             | Security and Compliance Owner        | Engineering Lead                                  | ROLE_ASSIGNED                             | 2026-07-26      | APPROVED        |
| CC-MON-01  | Medium      | Jeremy Powell (Founder) | AWS Infrastructure Owner             | AWS Infrastructure Owner             | Engineering Lead                                  | ROLE_ASSIGNED                             | 2026-07-26      | APPROVED        |
| CC-MON-02  | Medium      | Jeremy Powell (Founder) | AWS Infrastructure Owner             | Security and Compliance Owner        | Engineering Lead                                  | ROLE_ASSIGNED                             | 2026-07-26      | APPROVED        |
| CC-IR-01   | High        | Jeremy Powell (Founder) | Incident Response Lead               | Incident Response Lead               | Security and Compliance Owner                     | ROLE_ASSIGNED                             | 2026-07-26      | APPROVED        |
| A-AVL-01   | Medium      | Jeremy Powell (Founder) | AWS Infrastructure Owner             | AWS Infrastructure Owner             | Business Continuity Owner                         | ROLE_ASSIGNED                             | 2026-07-26      | APPROVED        |
| A-AVL-02   | High        | Jeremy Powell (Founder) | Business Continuity Owner            | AWS Infrastructure Owner             | Database Owner                                    | ROLE_ASSIGNED                             | 2026-07-26      | APPROVED        |
| A-AVL-03   | High        | Jeremy Powell (Founder) | Business Continuity Owner            | Business Continuity Owner            | AWS Infrastructure Owner                          | ROLE_ASSIGNED                             | 2026-07-26      | APPROVED        |
| A-AVL-04   | Medium      | Jeremy Powell (Founder) | AWS Infrastructure Owner             | AWS Infrastructure Owner             | Application Security Owner                        | ROLE_ASSIGNED                             | 2026-07-26      | APPROVED        |
| C-CNF-01   | Medium      | Jeremy Powell (Founder) | Security and Compliance Owner        | Security and Compliance Owner        | Product Owner                                     | ROLE_ASSIGNED                             | 2026-07-26      | APPROVED        |
| C-CNF-02   | High        | Jeremy Powell (Founder) | AWS Infrastructure Owner             | AWS Infrastructure Owner             | Database Owner                                    | ROLE_ASSIGNED                             | 2026-07-26      | APPROVED        |
| CC-VEN-01  | Medium      | Jeremy Powell (Founder) | Vendor Management Owner              | Vendor Management Owner              | Security and Compliance Owner                     | ROLE_ASSIGNED                             | 2026-07-26      | APPROVED        |

### Unassigned controls

**None.** All listed controls are `ROLE_ASSIGNED` or `NAMED` for accountability. No control is `UNASSIGNED`.

### RACI (program level)

| Activity                 | Jeremy Powell     | Security and Compliance Owner | AWS Infrastructure Owner | Engineering Lead | Product Owner |
| ------------------------ | ----------------- | ----------------------------- | ------------------------ | ---------------- | ------------- |
| Scope / TSC approval     | A                 | R                             | C                        | C                | C             |
| Policy approval          | A                 | R                             | C                        | C                | I             |
| Control operation        | A (High residual) | R/A by family                 | R                        | R                | C             |
| Risk acceptance (High+)  | A                 | C                             | C                        | C                | C             |
| External auditor liaison | A                 | R                             | C                        | C                | I             |

R = Responsible, A = Accountable, C = Consulted, I = Informed

### Revision history

| Version | Date       | Change                                                                            |
| ------- | ---------- | --------------------------------------------------------------------------------- |
| 0.1     | 2026-07-26 | Phase 0 interim role families                                                     |
| 0.2     | 2026-07-26 | Phase 1 per-control ownership with required fields; Jeremy Powell named executive |
