# 02 — Pilot Tenant

**Phase:** FX-P1  
**Status:** **PENDING DESIGNATION — NO PLACEHOLDERS ACCEPTED**

Complete every field with real values before Wave 1. Do not invent UUIDs.

| Field                 | Value                                                    |
| --------------------- | -------------------------------------------------------- |
| Tenant UUID           | _Required — not set_                                     |
| Tenant name           | _Required — not set_                                     |
| Environment           | _Required — not set_                                     |
| Primary Administrator | _Required — not set_                                     |
| Technical Contact     | _Required — not set_                                     |
| Deployment Window     | _Required — not set_                                     |
| Rollback Contact      | _Required — not set_                                     |
| Pilot Start Date      | _Required — not set_                                     |
| Pilot End Date        | _Required — not set_                                     |
| Approved Modules      | _Required — list waves/modules approved for this tenant_ |

## Constraints

- **One** pilot tenant only unless separately authorized.
- Do **not** use synthetic development tenants for production pilot without explicit approval.
- Platform-admin accounts must not rely on FX (resolvers force FX off for platform admins unless env/session override).

## Designation approval

| Decision | Date | Approver | Notes                                   |
| -------- | ---- | -------- | --------------------------------------- |
| Awaiting | —    | —        | Blocks FX-P1 Wave 1 and all GA activity |
