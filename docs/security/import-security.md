# Import Platform — Security

**Status:** Draft  
**Date:** 2026-07-28  
**Canonical architecture:** `docs/architecture/import-platform/IMPORT_SECURITY_MODEL.md`

## Summary controls

| Control                      | Status at architecture stop                       |
| ---------------------------- | ------------------------------------------------- |
| FORCE RLS on import_* tables | Designed in `0022` (not applied yet)              |
| Permission model             | `platform.import.*` / `tenant.import.*` specified |
| Short-lived upload URLs      | Specified                                         |
| Encrypted S3                 | Existing imports bucket pattern                   |
| Malware scan gate            | Architected (scanner wiring later)                |
| Cross-tenant rejection       | Validation rule `cross_tenant`                    |
| Audit + correlation IDs      | Required on mutating APIs                         |
| Sensitive identifier masking | Required in preview/export without entitlement    |

## Permissions (to seed in implementation sprint)

- `platform.import.read`
- `platform.import.manage`
- `platform.import.execute`
- `tenant.import.read`
- `tenant.import.manage`
- `tenant.import.execute`

## Configuration Platform

Import consumes published config; it must not widen configuration permissions.
