# FX Timeline Framework

**Program:** Forge Experience (FX)  
**Version:** FX-S0  
**Status:** APPROVED (Part 3)

Every record contains a **standardized timeline**.

## Ownership

| Layer                                                       | Owner                  |
| ----------------------------------------------------------- | ---------------------- |
| Event anatomy, immutability UX, filter/search/expand chrome | **FX**                 |
| Event production, retention, redaction policy               | **Platform / product** |

## Immutability

Timeline entries are **immutable**.  
Corrections are new entries (or linked audit amendments), never silent edits of history.

---

## Standard timeline entry types

| Entry               | Meaning                                         |
| ------------------- | ----------------------------------------------- |
| Created             | Record created                                  |
| Updated             | Record updated                                  |
| Viewed              | View event when policy records views            |
| Assigned            | Assignment change                               |
| Approved            | Approval decision                               |
| Rejected            | Rejection decision                              |
| Comment Added       | Comment/note                                    |
| Document Uploaded   | Document added                                  |
| Photo Added         | Photo added                                     |
| Status Changed      | Status change                                   |
| Workflow Transition | Explicit workflow transition (includes from/to) |
| Notification Sent   | Notification dispatched                         |
| Export Generated    | Export produced                                 |

Products may extend entry types. They may not remove immutability or shared anatomy.

## Entry anatomy

Every entry presents:

- Timestamp
- Actor (when applicable)
- Entry type label
- Summary
- Optional deep link / audit link
- Optional structured from→to for transitions

## Capabilities

| Capability  | Behavior                            |
| ----------- | ----------------------------------- |
| Filtering   | By type, actor, date range          |
| Search      | Within timeline summaries           |
| Expand      | Progressive detail                  |
| Collapse    | Default compact list                |
| Audit Links | To audit views when permitted       |
| Deep Links  | To related artifacts when permitted |

## Placement

Timeline appears in the shared workspace layout and as the Timeline tab when applicable ([11-workspace-framework.md](./11-workspace-framework.md)).

## Accessibility

- Ordered list semantics
- Time as accessible text
- Expand controls named

## Anti-patterns

- Editable history rows
- Chat-style mutable threads presented as audit timeline
- Color-only event type encoding
- Product-specific timeline chrome

## Related

- [16-record-framework.md](./16-record-framework.md)
- [28-workflow-framework.md](./28-workflow-framework.md)
- [11-workspace-framework.md](./11-workspace-framework.md)
- [components/data.md](./components/data.md)
