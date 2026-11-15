# Initial Access Review Inventory

**Document ID:** SOC2-AR-001  
**Version:** 0.1  
**Date:** 2026-07-26  
**Environment:** development (`511343547817` / `us-east-1`)  
**Control:** CC-ACC-03  
**Status:** ACCEPTED as Phase 1 baseline inventory (2026-07-26)  
**Reviewer:** Jeremy Powell  
**Classification:** Confidential

> No access keys or secret values are recorded. Cognito usernames are listed without full email addresses where possible. **Do not remove or modify access based on this inventory without a further REMOVE/REDUCE decision**, unless responding to an active security incident. Quarterly review cadence remains an open operating control.

---

## Classification legend

| Label              | Meaning                                    |
| ------------------ | ------------------------------------------ |
| APPROPRIATE        | Appears needed for current operating model |
| REMOVE             | Candidate for removal                      |
| REDUCE             | Over-privileged; tighten                   |
| INVESTIGATE        | Insufficient information                   |
| EXCEPTION_REQUIRED | Keep only with documented exception        |

---

## 1. AWS IAM Identity Center

| Entry          | Detail                                                  | Classification | Notes                                       |
| -------------- | ------------------------------------------------------- | -------------- | ------------------------------------------- |
| SSO instance   | `ssoins-722377dc9477a3a5` (ACTIVE, primary `us-east-1`) | APPROPRIATE    | Account is Organizations management account |
| Identity store | `d-90667981af`                                          | APPROPRIATE    |                                             |

**Account assignments:** Full permission-set assignment enumeration requires Identity Center admin API pagination in a follow-up review. Phase 1 records the instance baseline only.

---

## 2. IAM users

| Entry                | Classification | Notes                                                                       |
| -------------------- | -------------- | --------------------------------------------------------------------------- |
| IAM users in account | APPROPRIATE    | `list-users` returned **empty** — privileged human access appears SSO-based |

---

## 3. IAM roles (admin / deploy related)

| Role                                | Classification | Notes                                                                                 |
| ----------------------------------- | -------------- | ------------------------------------------------------------------------------------- |
| `AWSReservedSSO_ForgeDeployAdmin_*` | APPROPRIATE    | Used by `forge-dev` / forge-admin SSO sessions for deploy                             |
| `AWSServiceRoleForSSO`              | APPROPRIATE    | AWS service-linked                                                                    |
| Other ECS/CDK execution roles       | INVESTIGATE    | Full role inventory not exhaustively classified this pass — schedule quarterly review |

---

## 4. Access keys

| Entry                           | Classification | Notes                                                  |
| ------------------------------- | -------------- | ------------------------------------------------------ |
| Long-lived IAM user access keys | APPROPRIATE    | No IAM users present → no user access keys inventoried |
| Temporary SSO session keys      | APPROPRIATE    | Expected; not stored                                   |

---

## 5. Cognito privileged / platform users

User pool: `us-east-1_VYjUFLXG4` (forge-development).  
Inventory generated 2026-07-26. Classify after human review of membership vs need.

| Pattern / note                                             | Classification | Notes                                      |
| ---------------------------------------------------------- | -------------- | ------------------------------------------ |
| Synthetic RMS admins (`admin@rms-synthetic*.test` pattern) | APPROPRIATE    | Phase 2 acceptance tenants                 |
| Bootstrap / founder emails (if present)                    | INVESTIGATE    | Confirm still required for Creator Console |
| Disabled users                                             | REMOVE         | Candidate after confirmation               |
| Unknown enabled users                                      | INVESTIGATE    |                                            |

Raw Cognito export retained only temporarily for review preparation; strip PII before sharing externally.

---

## 6. Forge platform administrators

| Entry                              | Classification | Notes                                                                            |
| ---------------------------------- | -------------- | -------------------------------------------------------------------------------- |
| Creator Console admin capabilities | INVESTIGATE    | Map application-level admin permissions in next quarterly review                 |
| Database `forge_admin` custodians  | REDUCE         | Limit to migration/break-glass; runtime uses `forge_app` (verified task def :14) |

---

## 7. GitHub repository administrators

| Entry                  | Classification | Notes                                                                 |
| ---------------------- | -------------- | --------------------------------------------------------------------- |
| GitHub org/repo admins | INVESTIGATE    | No CODEOWNERS file; enumerate via GitHub org settings in human review |
| Environment approvers  | INVESTIGATE    | Check GitHub Environment protection rules for deploy workflows        |

---

## 8. Database roles

| Role                          | Classification           | Notes                              |
| ----------------------------- | ------------------------ | ---------------------------------- |
| `forge_app`                   | APPROPRIATE              | Runtime; no BYPASSRLS; FORCE RLS   |
| `forge_admin` / master        | APPROPRIATE (restricted) | Migrations and approved admin only |
| Table-owner / migration roles | APPROPRIATE              | Not used by ECS runtime            |

Evidence: `docs/compliance/soc2/evidence/testing/database-runtime-role.json`

---

## 9. Support-access roles

| Entry                             | Classification | Notes                                                                                                                    |
| --------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Dedicated support-access IAM role | INVESTIGATE    | Not identified as a separate named role in Phase 1 scan — may be absent (document or create under Support Access Policy) |

---

## Required human actions

1. Review Cognito enabled users and mark REMOVE/REDUCE.
2. Enumerate Identity Center account assignments and permission sets.
3. Enumerate GitHub admins/approvers.
4. Confirm whether a dedicated support-access role is required.
5. Sign this review (reviewer + date) before executing removals.

| Field       | Value                                                                        |
| ----------- | ---------------------------------------------------------------------------- |
| Reviewed by | Jeremy Powell                                                                |
| Reviewed at | 2026-07-26                                                                   |
| Approval    | APPROVED (baseline inventory; no removals authorized by this approval alone) |
