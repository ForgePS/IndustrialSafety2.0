# Configuration Platform — authorization report (release readiness)

**Date:** 2026-07-28  
**API:** `forge-development-ecs-platform-api:28` / `config-accept-20260728092807`  
**Evidence:** `docs/testing/evidence/config-final-acceptance/authz-matrix-full.json`  
**Remediation:** ECS forge_admin one-off stripped `platform.configuration.update` and `platform.configuration.publish` from `CONFIG_TENANT_ADMIN` on tenant `019f9e06-a0b2-75f4-9e0b-5ae9befd8193` (seed already limited to `tenant.configuration.*`).

## Live 7-persona matrix (`config-authz-matrix.mjs`)

| Persona                        | Cases                                      | Result                          |
| ------------------------------ | ------------------------------------------ | ------------------------------- |
| Forge Creator (platform admin) | catalog / draft / publish                  | PASS                            |
| Platform Support               | catalog / draft / publish / security allow | PASS                            |
| Tenant Administrator           | branding allow / security deny             | PASS (`ta.security_deny` → 403) |
| Configuration Manager          | draft allow / security deny                | PASS                            |
| Read-only Auditor              | catalog+list allow / draft deny            | PASS                            |
| Standard user                  | catalog deny                               | PASS                            |
| Update-only                    | draft allow / publish deny                 | PASS                            |
| Publish-only                   | draft deny / catalog allow                 | PASS                            |
| Unauthenticated                | 401                                        | PASS                            |

`CONFIG_TENANT_ADMIN` remaining permission codes after remediation:

- `platform.audit.read`
- `platform.organization.read`
- `platform.permission.read`
- `platform.tenant.read`
- `platform.tenant.update`
- `tenant.configuration.publish`
- `tenant.configuration.update`

## Permission independence

| Rule                                             | Status                                                                    |
| ------------------------------------------------ | ------------------------------------------------------------------------- |
| Tenant Admin cannot use platform.configuration.* | PASS (live deny on security NS after remediation)                         |
| Tenant Admin cannot modify `security`            | PASS (`ta.security_deny` 403)                                             |
| Configuration Manager cannot modify `security`   | PASS                                                                      |
| Read-only cannot mutate                          | PASS                                                                      |
| Update ≠ publish                                 | PASS (update_only / publish_only)                                         |
| Denials use standard error contract              | PASS (403/401)                                                            |
| Dry-run import (no persistence)                  | PASS (`dry_run_import` in matrix)                                         |
| API enforcement                                  | PASS (Nest `@RequireAnyPermission` + service asserts)                     |
| Audit                                            | PASS (draft/publish/schedule/archive/rollback write audit)                |
| UI visibility                                    | PASS (catalog `tenantAdminEditable` flags; Tenant Admin allowlist routes) |

## Totals

| Metric  | Value  |
| ------- | ------ |
| Cases   | **22** |
| Passed  | **22** |
| Failed  | **0**  |
| Skipped | **0**  |

**Verdict:** PASS (full seeded matrix). Prior failure `ta.security_deny` (actual 201) cleared by removing platform configuration permissions from `CONFIG_TENANT_ADMIN`.
