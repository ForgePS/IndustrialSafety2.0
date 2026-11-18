# MK-S13 Plan — Notifications / Email

## Objective

Add an in-app notification inbox (model + API + UI) and a provider-neutral email abstraction with SES-capable implementation, seeded template keys, without production deploy.

## Changes

1. `user_notifications` table + RLS + migration `0032_mk_s13_notifications.sql` (not applied prod).
2. Contracts: notification domain + canonical email/notification template keys.
3. API: list, unread count, mark read, mark all read; internal create + optional email send.
4. Email provider: `NoopEmailProvider` + `SesEmailProvider` (env-gated; default noop).
5. Wire `ForgeNotificationMenu`; Tenant Admin `/notifications` inbox.
6. Seed Config Studio email template defaults for MK-S13 keys.
7. Permissions: `tenant.notification.read` / `tenant.notification.manage`.

## Out of scope

- Production SES identity deploy / DNS
- Full worker SQS consumer productionization (queue already exists; enqueue optional)
- MK-S14+ storage/API keys
- SMS / push channels
