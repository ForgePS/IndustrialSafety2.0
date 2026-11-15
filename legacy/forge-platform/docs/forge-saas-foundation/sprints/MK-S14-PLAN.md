# MK-S14 Plan — Storage / Branding

## Objective

Extend tenant branding for Makerkit-class fields and enforce tenant-scoped ownership of logo/icon assets via forge_documents + tenant-prefixed object keys. No production ops.

## Changes

1. Extend `tenant_branding` with displayName, shortName, approved colors, contact, report identity, document footer.
2. Ownership checks before branding PUT assigns logo/icon document IDs.
3. Branding asset upload/download presign (`tenants/{tenantId}/branding/...`).
4. Permissions: `platform.configuration.update` OR `tenant.configuration.update`.
5. Unit tests: A≠B read/overwrite; expired signed access helper.
6. UI forms (Tenant Admin + Creator branding pages).
7. Docs `STORAGE_BRANDING.md`; migration `0033` not applied prod.

## Out of scope

- Production SES/CDK bucket changes beyond reuse
- Studio redesign / dual-store merge
- MK-S15 API keys
