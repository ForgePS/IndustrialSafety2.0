# Legal Acknowledgments — Security

## Why immutable

Acknowledgments are legal/audit evidence. Overwriting or deleting them would destroy the ability to prove what language was accepted and when.

## Hashes

SHA-256 of the canonical UTF-8 document content at publish time. Acceptance records store `document_version_id` and `document_hash` as accepted.

## Tenant isolation

- Tenant-scoped rows use FORCE RLS on `tenant_id`.
- Global documents (`tenant_id IS NULL`) are readable by all authenticated tenants; only platform admins publish them.
- Tenant policies never appear in another tenant’s requirement set or exports.
- Users cannot acknowledge for another `user_id`.

## Server-side gate

Frontend redirect is advisory. Protected APIs check outstanding **blocking** requirements when `industrial.legalAcknowledgments.loginGate.enabled` is effective.

## Metadata retained

- User, tenant, product, document version, hash, UTC timestamp, acceptance action, safe session id, optional IP/UA, optional name/email/role snapshots.

## Metadata not retained

- Passwords, password hashes, MFA secrets, access/refresh/session tokens, precise geolocation, biometrics, invasive device fingerprints.
