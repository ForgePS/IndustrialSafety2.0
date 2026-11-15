# FX Workspace Framework

**Program:** Forge Experience (FX)  
**Version:** FX-S0  
**Status:** APPROVED (Part 3)

Every record opens into a **shared workspace**.  
Never create completely different layouts for different modules.

## Ownership

- FX owns workspace chrome, tab behavior, and section order patterns
- Products supply record fields, domain actions, and optional extra tabs
- Products may **extend** the standard tab list; they may **not** replace standard tab behavior

## Workspace layout

```text
Workspace Header
        ↓
Record Summary
        ↓
Primary Actions
        ↓
Status Panel
        ↓
Workspace Tabs
        ↓
Main Content
        ↓
Timeline
        ↓
Audit History
        ↓
Attachments
        ↓
Related Records
        ↓
Notes
        ↓
Activity Feed
```

Not every section is visible for every record type. Sections appear when applicable, in this relative order when present. Products do not reorder core chrome arbitrarily.

## Workspace Header

- Record title, type label, environment-safe ID (monospace)
- Status Badge · Priority Badge
- Owner / assignee presentation
- Overflow for secondary record actions

## Record Summary

- Highest-signal facts for operational scanning
- Progressive disclosure into Details tab for the rest

## Primary Actions

- Role-relevant commits (Edit, Assign, Approve, Complete, …)
- Permission-filtered; danger actions use Confirmation Dialog

## Status Panel

- Workflow state, blockers, health indicators
- Answers: what is happening / what needs attention

## Workspace Tabs

See standardized tabs below. Level-3 navigation only — do not invent deeper nav trees.

## Main Content

- Active tab panel body (Overview, Details, etc.)
- Forms embed here in service of the record — forms are not a separate app

## Timeline · Audit · Attachments · Related · Notes · Activity

- Shared FX patterns; product data only
- Timeline entries immutable (see Timeline Framework)

## Responsive behavior

| Surface     | Behavior                                                            |
| ----------- | ------------------------------------------------------------------- |
| Desktop     | Header + tabs + optional right context                              |
| Tablet      | Collapsible summary; tabs scroll                                    |
| Phone       | Summary → actions → tabs as full-width sections; avoid multi-column |
| Ops display | Larger type; emphasize status + primary actions                     |

## Anti-patterns

- Module-unique workspace shells
- Replacing Overview/History semantics per product
- Hiding audit/timeline for convenience
- Forms that remove record identity from the header

## Related

- [16-record-framework.md](./16-record-framework.md)
- [18-timeline-framework.md](./18-timeline-framework.md)
- [components/foundation.md](./components/foundation.md)
- [09-navigation-framework.md](./09-navigation-framework.md)

---

## Workspace tabs (standard)

Every workspace supports these tabs **when applicable**:

| Tab             | Role                                  |
| --------------- | ------------------------------------- |
| Overview        | Operational summary and next actions  |
| Details         | Full field layout                     |
| History         | Human-readable change history         |
| Timeline        | Standardized immutable timeline       |
| Attachments     | Files                                 |
| Photos          | Image gallery subset                  |
| Notes           | Notes / comments                      |
| Related Records | Linked records                        |
| Tasks           | Tasks on this record                  |
| Approvals       | Approval chain / decisions            |
| Audit           | Audit-oriented view / deep links      |
| Documents       | Document-centric attachments/versions |
| Settings        | Record-level settings when entitled   |

**Extension rule:** Products may add tabs (for example Map, LOTO Steps, Roster).  
**Non-negotiable:** Products may not redefine the behavior of the standard tabs above.
