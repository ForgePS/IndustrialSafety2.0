# FX Operational Cards

**Family:** Operational  
**Pattern:** All operational cards share one FX anatomy; products supply domain fields.

## Shared anatomy

| Slot      | Content                             |
| --------- | ----------------------------------- |
| Identity  | Title + record type label           |
| Status    | Status Badge                        |
| Priority  | Priority Badge (optional)           |
| Meta      | Key facts (due, location, assignee) |
| Attention | Why it needs action now             |
| Actions   | Primary + overflow                  |

## Shared contract

- **Purpose:** Role-driven attention objects for queues, My Work, dashboards, maps popovers
- **Properties:** `title`, `status`, `priority`, `meta[]`, `href`, `actions`, `domain`
- **Variants:** Compact · Standard · Expanded
- **States:** default, hover, focus, selected, loading, disabled
- **Permissions:** Actions omitted when unauthorized
- **Accessibility:** Article/group with labelled title; status not color-only
- **Keyboard:** Card is link or has explicit action buttons (avoid whole-card + nested button traps)
- **Screen reader:** Announce type + title + status
- **Responsive:** Full width on phone; 2–4 column grids on desktop
- **Examples:** Overdue inspection in My Work
- **Anti-patterns:** Unique card chrome per product; embedding full forms in cards
- **Future extension points:** Domain field packs registered per card type below

## Card types

| Card               | Domain examples                |
| ------------------ | ------------------------------ |
| Task Card          | Assignments, approvals         |
| Inspection Card    | Fire / safety inspections      |
| Incident Card      | Incidents / responses          |
| Occupancy Card     | Buildings / occupancies        |
| Hydrant Card       | Hydrant assets                 |
| Fleet Card         | Fleet vehicles                 |
| Apparatus Card     | Apparatus units                |
| Student Card       | Academy students               |
| Training Card      | Courses / sessions             |
| Certification Card | Certifications                 |
| Violation Card     | Violations / findings          |
| Permit Card        | Permits / LOTO-related permits |

Each type uses the shared anatomy; only meta fields and default actions differ.
