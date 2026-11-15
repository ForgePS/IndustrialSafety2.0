# FX Notification Framework

**Program:** Forge Experience (FX)  
**Version:** FX-S0  
**Status:** APPROVED (Part 3)

## Ownership

| Layer                                                                    | Owner                  |
| ------------------------------------------------------------------------ | ---------------------- |
| Categories, center UX, item anatomy, dismiss/snooze/archive presentation | **FX**                 |
| Delivery backends, preference storage, fan-out, entitlement              | **Platform / product** |

Notifications must respect **user permissions** and **notification preferences**.  
Never use notifications to reveal restricted records.

---

## Notification categories

| Category    | Use                             |
| ----------- | ------------------------------- |
| Critical    | Immediate operational attention |
| Warning     | Elevated risk / soon-due        |
| Information | Non-urgent awareness            |
| Reminder    | Time-based nudge                |
| Approval    | Approval requested / decided    |
| Assignment  | Work assigned                   |
| Completion  | Successful completion           |
| Failure     | Failed job / action             |
| Escalation  | Escalated attention             |

Severity presentation maps to status/priority tokens; category label remains explicit.

---

## Delivery channels

Notifications may be delivered through:

- In-app
- Email
- SMS
- Push notifications
- Dashboard widgets
- Digital signage
- Future integrations

FX standardizes in-app anatomy and deep-link behavior. Other channels follow the same content contract where applicable.

---

## Notification payload (every notification)

| Field          | Requirement                                |
| -------------- | ------------------------------------------ |
| Title          | Required                                   |
| Description    | Required short body                        |
| Priority       | Required                                   |
| Timestamp      | Required                                   |
| Related Record | When applicable                            |
| Deep Link      | Permission-safe destination                |
| Dismiss        | Supported                                  |
| Snooze         | Supported when channel allows              |
| Archive        | Supported in notification center           |
| Audit Entry    | Created for send/act where policy requires |

## Center behavior

- Group by category or time
- Unread counts in shell
- Empty/loading/error states
- Opening a restricted deep link fails closed without leaking existence beyond policy

## Accessibility

- Polite/assertive live regions by severity policy
- Keyboard operable list and actions
- Do not steal focus for low-severity toasts

## Anti-patterns

- Critical ops alerts as silent badges only
- Marketing-style notification spam
- Deep links to unauthorized records that confirm existence against policy

## Related

- [08-application-shell.md](./08-application-shell.md)
- [12-my-work-framework.md](./12-my-work-framework.md)
- [10-dashboard-framework.md](./10-dashboard-framework.md)
- [23-security-ux.md](./23-security-ux.md)
