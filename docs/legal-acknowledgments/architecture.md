# Legal Acknowledgments — Architecture (S1)

## Purpose

Versioned, append-only legal acknowledgment evidence and transaction attestations for Forge products. Initial product: **Forge Industrial Safety**.

## Authoritative adaptations

| Concern | Forge source of truth |
| --- | --- |
| Authentication | Cognito JWT → `AuthContextService` / `authentication_identities` |
| Session | Cognito access token; safe `jti`/`iat` references only — never tokens/passwords |
| Tenant | `x-tenant-id` + `withTenantTransaction` / FORCE RLS |
| User | `users` + `user_tenant_memberships` |
| Personnel | Optional snapshot via `industrial_personnel.userAuthId` — **not** duplicated |
| RBAC | `permissions` / roles; codes `industrial.legal.*` |
| Audit | `AuditService` → `audit_events` (parallel to evidence tables) |
| Feature flags | `feature_definitions` / `feature_overrides` |
| Migrations | `packages/database/drizzle/0052_legal_acknowledgments_s1.sql` |

## Levels

1. **Customer contract** — out of scope for execution in this sprint (metadata only later).
2. **Platform user acknowledgment** — login gate after auth.
3. **Transaction attestation** — append-only per workflow action (Training completion first).

## Enforcement

1. User authenticates.
2. `GET /api/v1/auth/me` includes `legalAcknowledgments` when Industrial product is active and flags allow.
3. Industrial shell redirects to `/legal/acknowledge` when status is `REQUIRED`.
4. Nest `LegalAcknowledgmentGuard` blocks protected industrial APIs with `LEGAL_ACKNOWLEDGMENT_REQUIRED` unless allowlisted.

## Immutability

- Published document versions are not edited in place.
- `user_legal_acknowledgments` and `transaction_attestations` are INSERT-only (`REVOKE UPDATE, DELETE`).
- Corrections use `legal_acknowledgment_events` (REVOKED / ADMINISTRATIVELY_CORRECTED).

## Hashing

Canonical content = UTF-8 string of the stored `content` column (trimmed once at publish). `content_hash` = SHA-256 hex digest.

## Rollback

Disable `industrial.legalAcknowledgments.enabled` (and/or `.loginGate.enabled`). Evidence and documents are retained.

## Deployment

**Development only** for S1. Production migration, ECS, frontend, and flag enablement are **not authorized**.
