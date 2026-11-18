# FX My Work Framework

**Program:** Forge Experience (FX)  
**Version:** FX-S0  
**Status:** APPROVED (Part 3)

Every Forge application shall expose a unified **My Work** experience.

My Work is role-driven: users work from responsibilities, never from database collections.

## Ownership

| Layer                                                 | Owner                  |
| ----------------------------------------------------- | ---------------------- |
| Aggregation UX, filters, views, bulk actions chrome   | **FX**                 |
| Work item producers, assignment rules, domain meaning | **Product / platform** |

## Aggregates

My Work aggregates:

- Assigned tasks
- Pending approvals
- Upcoming training
- Certification expirations
- Inspection assignments
- Incident reports
- Incomplete forms
- Draft documents
- Unread notifications
- Follow-ups
- Flagged items
- Overdue items
- Scheduled work
- Recent activity

Products publish items into this model; they do not ship alternate “my queue” shells.

## Supported capabilities

| Capability       | Behavior                                              |
| ---------------- | ----------------------------------------------------- |
| Filters          | Tokenized filter chips; clear-all                     |
| Sorting          | Shared sort keys (priority, due, updated, type)       |
| Grouping         | By type, priority, due window, status                 |
| Saved Views      | Named personal/tenant views when platform supports    |
| Favorites        | Pin frequent items/destinations                       |
| Bulk Actions     | Multi-select with permission checks per item          |
| Quick Complete   | Complete eligible items without full record open      |
| Quick Reassign   | Reassign when permitted                               |
| Priority Changes | Via Priority Badge patterns                           |
| Status Changes   | Via shared workflow states                            |
| Search           | Filter My Work set; global search remains shell-level |
| Calendar View    | Schedule-oriented                                     |
| List View        | Default operational list                              |
| Board View       | Status/priority columns                               |
| Timeline View    | Chronological work stream                             |
| Map View         | When items are spatial and applicable                 |

## Item anatomy

Shared with operational cards:

- Title · type · status · priority · due/attention reason · record deep link · primary action · overflow

## Accessibility and responsive

- List/board keyboard operable
- Map view always offers list alternative
- Phone: list-first; board as horizontal columns or filtered list
- Ops display: larger overdue/critical emphasis

## Anti-patterns

- Product-specific My Work pages with different interaction models
- Schema-named groups (“Tables”, “Collections”)
- Bulk actions that skip per-item permission validation

## Related

- [components/operational-cards.md](./components/operational-cards.md)
- [14-notification-framework.md](./14-notification-framework.md)
- [28-workflow-framework.md](./28-workflow-framework.md)
- [10-dashboard-framework.md](./10-dashboard-framework.md)
