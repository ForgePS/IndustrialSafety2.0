# Access control matrix — Configuration Platform

**Date:** 2026-07-28  
**Scope:** Configuration Studio / `@forge/configuration` / config_* APIs

| Capability                              | Forge Creator                    | Platform Support    | Tenant Administrator                       | Configuration Manager | Read-only Auditor    | Standard User | Unauthorized |
| --------------------------------------- | -------------------------------- | ------------------- | ------------------------------------------ | --------------------- | -------------------- | ------------- | ------------ |
| View catalog / effective defaults       | Yes                              | Yes (time-limited*) | Delegated NS only                          | Yes (tenant)          | Yes (tenant)         | No            | No           |
| Create / edit draft                     | `platform.configuration.update`  | Yes*                | `tenant.configuration.update` + allowlist  | update                | No                   | No            | No           |
| Publish / schedule / archive / rollback | `platform.configuration.publish` | Yes*                | `tenant.configuration.publish` + allowlist | publish               | No                   | No            | No           |
| Compare / version history               | update or publish                | Yes*                | update or publish                          | Yes                   | view-only if granted | No            | No           |
| Import / export bundle                  | update (+ publish to apply)      | Yes*                | update (tenant scope)                      | Yes                   | No                   | No            | No           |
| View audit                              | platform audit perms             | Yes*                | tenant audit if entitled                   | if entitled           | Yes                  | No            | No           |
| Manage platform-locked security         | Creator only                     | Support*            | **Denied**                                 | Denied                | Denied               | Denied        | Denied       |
| Grant Creator permissions               | Creator only                     | No                  | **Denied**                                 | Denied                | Denied               | Denied        | Denied       |

\* Platform Support access is intended to be time-limited and audited; full support-session machinery may be incomplete — treat as limitation until operationalized.

## Permission keys

- `platform.configuration.update`
- `platform.configuration.publish`
- `tenant.configuration.update`
- `tenant.configuration.publish`

## Confirmations (acceptance)

| Rule                                                   | Status                                                                             |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| Tenant Admin namespaces = 13-item allowlist            | PASS (package + Tenant Admin routes)                                               |
| Creator-only modules hidden from Tenant Admin          | PASS (UI + namespace check)                                                        |
| Publish ≠ platform-default management                  | PASS (no separate platform-owned rows; security NS Creator-only)                   |
| Standard denials use Nest/Forge error contract         | PASS (API pattern)                                                                 |
| Live role matrix against Aurora for all seven personas | NOT_RUN_LIVE (API image at acceptance still pre-config until config-accept deploy) |
