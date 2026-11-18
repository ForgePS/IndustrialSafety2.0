# Notifications / Email (MK-S13)

## In-app inbox

| Field       | Storage                        |
| ----------- | ------------------------------ |
| tenant      | `user_notifications.tenant_id` |
| user        | `user_notifications.user_id`   |
| type        | `type`                         |
| priority    | `priority`                     |
| destination | `IN_APP` \| `EMAIL` \| `BOTH`  |
| read state  | `read_at` null = unread        |
| created     | `created_at`                   |
| expires     | `expires_at`                   |

API (tenant-scoped, own user):

- `GET /api/v1/tenants/:tenantId/notifications`
- `GET .../unread-count`
- `POST .../read-all`
- `POST .../:id/read`
- `POST .../` create (requires `tenant.notification.manage`)

Permissions:

- `tenant.notification.read` — inbox self-service
- `tenant.notification.manage` — create / trigger delivery

UI:

- `ForgeNotificationMenu` unread count + list + mark read / mark all
- Tenant Admin `/notifications` inbox page

## Email provider

Abstraction in `apps/platform-api/src/modules/notifications/email-provider.ts`:

- `NoopEmailProvider` (default, `FORGE_EMAIL_PROVIDER=noop`)
- `SesEmailProvider` stub (`FORGE_EMAIL_PROVIDER=ses`); requires `SES_FROM_ADDRESS` and injected `sendFn` for live SES

Canonical template keys: `welcome`, `verification`, `invitation`, `membership_changed`, `billing`, `security`, `system_notification` (Config Studio defaults seeded).

## Migration

`packages/database/drizzle/0032_mk_s13_notifications.sql` — **not applied to production** in this sprint.

## Out of scope (honored)

- Production SES identity / DNS
- Worker SQS consumer productionization
- SMS / push
