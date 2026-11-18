# Invitations / Member Management — FORGE-SAAS-CORE

**Sprint:** MK-S6  
**ADR:** [ADR-020](../decisions/ADR-020-invitation-lifecycle.md), [ADR-021](../decisions/ADR-021-tenant-membership-model.md)

## Invitation lifecycle

Statuses (storage): `DRAFT` | `PENDING` | `SENT` | `ACCEPTED` | `EXPIRED` | `REVOKED` | `FAILED`

SaaS aliases: pending → `PENDING`, accepted → `ACCEPTED`, expired → `EXPIRED`, revoked → `REVOKED`  
(Open “pending” in UI usually includes `DRAFT`/`PENDING`/`SENT`.)

Tokens: plaintext returned once on create/resend; only SHA-256 `invitationTokenHash` is stored.

## Workflows

| Action    | Behavior                                                                                          |
| --------- | ------------------------------------------------------------------------------------------------- |
| invite    | Create user+PENDING membership+roles/products; optional Cognito provision; optional `facilityIds` |
| resend    | Rotate token; Cognito resend; **extends `expiresAt` by 168h** (ADR-020)                           |
| revoke    | Terminal; linked membership REVOKED                                                               |
| accept    | Hash lookup; optional `email` must match invite; activate membership; link Cognito `sub`          |
| duplicate | CONFLICT if active invite or non-revoked membership for email                                     |

Cross-tenant invite create is forbidden unless platform admin.

## Member admin

| Action                           | API                                                          |
| -------------------------------- | ------------------------------------------------------------ |
| list / search / filter           | `GET .../memberships?status=&userId=&q=` (`q` = email ilike) |
| change role                      | `PUT .../memberships/:id/roles`                              |
| change products                  | `PUT .../memberships/:id/products`                           |
| facility scope                   | `PUT .../memberships/:id/facilities` `{ facilityIds }`       |
| deactivate / reactivate / remove | suspend / activate / revoke                                  |

## Facility scope

`facility_ids_json` on invitations and memberships (migration `0029_mk_s6_invitations.sql`). IDs must belong to the tenant. This is a membership hint until product APIs enforce facility ACL (BACKLOG if needed).

## Security checklist

- Expired token → deny
- Revoked / terminal → deny
- Reuse after accept → deny (existing e2e)
- Wrong accept email → deny when `email` provided
- Creator-only permissions cannot be granted by tenant admins (`assertGrantable`)
- Other-tenant invite → forbid
