# Audit / Observability (MK-S16)

## Principles

- REUSE `@forge/audit` + `audit_events` + correlation middleware + `@forge/observability` + existing CloudWatch log groups
- No parallel audit v2
- No secrets in logs (`redactSensitive` / `buildAuditRecord`)
- Distinct from CAD / AI narrative / CloudTrail SOC trails

## Required SaaS audit actions

Canonical codes live in `SAAS_AUDIT_ACTIONS` (`@forge/audit`):

| Domain                      | Action code(s)                                                          |
| --------------------------- | ----------------------------------------------------------------------- |
| Tenant                      | `tenant.create`, status transitions (`tenant.activate` / `suspend` / …) |
| Membership                  | `invitation.create`, `membership.revoke`, `membership.roles.set`        |
| Permissions                 | `role.permissions.set`                                                  |
| Modules                     | `entitlement.module.put`                                                |
| Billing / contracts / flags | existing `billing.*` / `feature.put`                                    |
| API keys                    | `api_key.create`, `api_key.revoke`                                      |
| Webhooks                    | `webhook.endpoint.changed`                                              |
| Branding                    | `branding.put` (+ asset events)                                         |
| Support                     | `support.action`                                                        |
| Export                      | `audit.export.generated`                                                |

## API

- `GET /api/v1/tenants/:tenantId/audit-events`
- `GET /api/v1/tenants/:tenantId/audit-events/:id`
- `POST /api/v1/tenants/:tenantId/audit-events/export` — requires `platform.audit.export`; writes `audit.export.generated`
- `POST /api/v1/tenants/:tenantId/support-actions` — platform admin only; writes `support.action`

## Observability

| Capability       | Implementation                                             |
| ---------------- | ---------------------------------------------------------- |
| Correlation IDs  | `x-correlation-id` middleware → principal + audit + logs   |
| Structured logs  | `@forge/observability` `createLogger` JSON lines           |
| Error categories | `OBSERVABILITY_ERROR_CATEGORIES` + `logOperationalFailure` |
| AuthZ failures   | `authorization_decision_log` + AUTHORIZATION category logs |
| Webhook failures | WEBHOOK category on failed delivery attempts               |
| Email failures   | EMAIL category when provider returns `accepted: false`     |
| Unhandled errors | INTERNAL via exception filter (no secret dump)             |

CloudWatch log groups / dashboards already exist in CDK — this sprint does not change infra or deploy.

## Migration

`0035_mk_s16_audit_export_permission.sql` seeds `platform.audit.export` (not applied to production in this sprint).

## Non-goals

- Async S3 archive worker
- CAD audit merge
- Production SES / CloudTrail changes
- MK-S17 performance work
