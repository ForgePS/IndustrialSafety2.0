# Environments

**Document ID:** SOC2-SCOPE-004  
**Version:** 0.1 (draft)  
**Date:** 2026-07-26

---

## 1. Environment inventory

| Environment                         | AWS account            | Purpose                                                      | In readiness scope?                                        |
| ----------------------------------- | ---------------------- | ------------------------------------------------------------ | ---------------------------------------------------------- |
| **Development / current operating** | `511343547817`         | CDK-deployed Forge platform, RMS, Creator Console, NERIS 1–2 | **Yes** — primary system of record                         |
| **Local developer**                 | N/A                    | Engineer laptops, local Docker/DB as used                    | Process controls only (secure SDLC); not a hosted “system” |
| **CI**                              | GitHub Actions runners | Build, test, scan, deploy                                    | **Yes** — change and secure-SDLC controls                  |
| **Future production account**       | TBD                    | Hardened production isolation                                | Out of scope until provisioned and boundary updated        |

---

## 2. Data classification by environment

| Environment           | Expected data                                                      | Constraints                                                                                 |
| --------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Development / current | Synthetic and limited operational test data; treat as confidential | Follow `docs/security/development-data-policy.md`; no production PII dumps without approval |
| Local                 | Synthetic preferred                                                | No secrets committed; use gitignored env files                                              |
| CI                    | Synthetic fixtures, no live customer secrets in logs               | Gitleaks and secret scanning enforced                                                       |

---

## 3. Environment promotion

Changes flow:

```text
Local → PR → CI checks → merge → deploy to AWS environment
```

Evidence for change management lives in GitHub PR history, CI logs, and deploy records. See `../change-management/`.

---

## 4. Open environment decisions

| ID     | Decision                                           | Impact on SOC 2                                                    |
| ------ | -------------------------------------------------- | ------------------------------------------------------------------ |
| ENV-01 | Separate AWS production account timing             | Boundary and complementary user entity controls (CUECs) may change |
| ENV-02 | Staging vs prod parity                             | Availability and change testing evidence quality                   |
| ENV-03 | Shared “development” used as demo/customer preview | Risk of production-like data in non-prod — track in risk register  |

---

## 5. Naming note

Until a dedicated production account exists, documentation may say “development account” while the environment hosts the live Forge Public Safety platform under test/acceptance. Readiness language must describe this accurately to auditors — **do not imply a separate hardened prod account exists if it does not**.
