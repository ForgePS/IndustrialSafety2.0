# Audit Logging

**Sprint:** 1D  
**Related ADRs:** [ADR-015](../decisions/ADR-015-permission-based-authorization.md), [ADR-016](../decisions/ADR-016-outbox-pattern.md)

## Purpose

Platform mutations write **tenant-scoped audit events** in the same database transaction as the business change. Audit is complementary to domain events: audit answers “who did what to which resource,” while the outbox answers “what should downstream systems react to” ([ADR-016](../decisions/ADR-016-outbox-pattern.md)).

## Record shape

Built via `@forge/audit` `buildAuditRecord` / `AuditService.writeInTransaction`:

| Field                                         | Content                              |
| --------------------------------------------- | ------------------------------------ |
| `tenantId`                                    | Owning tenant                        |
| `actorUserId` / `actorPersonId` / `actorType` | Who acted                            |
| `action`                                      | Verb (create, update, suspend, …)    |
| `resourceType` / `resourceId`                 | Target                               |
| `organizationId`                              | Optional org scope                   |
| `result` / `riskLevel`                        | Outcome and sensitivity              |
| `beforeJson` / `afterJson`                    | Redacted snapshots                   |
| `metadataJson`                                | Extra context (no plaintext secrets) |
| `correlationId` / `requestId`                 | Request tracing                      |
| `ipAddress` / `userAgent`                     | Client metadata when available       |
| `occurredAt`                                  | Event time                           |

Sensitive keys in snapshots should be redacted (`@forge/audit` / `@forge/security` helpers).

## API

`api/v1/tenants/:tenantId/audit-events` (requires `platform.audit.read`):

| Method | Path             | Purpose                     |
| ------ | ---------------- | --------------------------- |
| GET    | `/`              | Paginated list              |
| GET    | `/:auditEventId` | Single event                |
| POST   | `/export`        | Export request (foundation) |

Creator console page: `/audit` (tenant query param required).

## When to write

Write an audit row for:

- Tenant lifecycle (activate, suspend, archive)
- Person create/update/merge/archive and sensitive-identifier access
- User invite/enable/disable and role assignment changes
- Entitlement, subscription, feature, and configuration changes
- Other privileged platform mutations

Prefer writing inside the domain transaction so a failed commit rolls back the audit row too.

## Authorization decisions

Fine-grained allow/deny evaluation may also persist to `authorization_decision_log` for high-risk paths ([ADR-015](../decisions/ADR-015-permission-based-authorization.md)). That log is RLS-scoped and separate from `audit_events`.

## Retention and archive

Sprint 1D stores audit in Aurora. Long-term archive to the audit S3 bucket (infra from Sprint 1C) is operational follow-up — not claimed complete here.

## Related

- Package tests: `packages/audit/src/index.test.ts`
- Tenant isolation: [tenant-isolation.md](./tenant-isolation.md)
