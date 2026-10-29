# FX Record Framework

**Program:** Forge Experience (FX)  
**Version:** FX-S0  
**Status:** APPROVED (Part 3)

Everything revolves around a **record**. Forms, reports, dashboards, and My Work are lenses on records — not separate applications.

## Required record attributes

Every record must have:

| Attribute         | Role                                                     |
| ----------------- | -------------------------------------------------------- |
| Unique Identifier | Stable ID (display may use friendly + mono technical id) |
| Title             | Human primary label                                      |
| Status            | Workflow / lifecycle status (Status Badge)               |
| Owner             | Responsible party presentation                           |
| Created By        | Actor                                                    |
| Created Date      | Timestamp                                                |
| Modified By       | Actor                                                    |
| Modified Date     | Timestamp                                                |
| Priority          | Priority Badge when applicable                           |
| Category          | Classification                                           |
| Related Records   | Links to other records                                   |
| Attachments       | Files / photos                                           |
| Comments          | Notes / discussion                                       |
| Timeline          | Immutable event stream                                   |
| Audit Trail       | Audit-capable history                                    |
| Permissions       | Effective access presentation (server authoritative)     |
| Record Health     | Attention / completeness / blocker signals               |

Products map domain fields into this contract. They do not omit core attributes without an FX-approved exception.

## Required record operations

Every record must support (when permitted):

| Operation | Notes                                                  |
| --------- | ------------------------------------------------------ |
| View      | Default workspace                                      |
| Edit      | In-place or edit mode; record identity remains visible |
| Archive   | Soft end-of-life; recoverable when policy allows       |
| Restore   | From archive when permitted                            |
| Duplicate | Creates a new record draft from source                 |
| Export    | Via reporting/export patterns                          |
| Print     | Printable view                                         |
| Share     | Share UX that never bypasses permissions               |
| Audit     | Jump to audit/timeline                                 |
| History   | History tab / view                                     |

Unauthorized operations are omitted (prefer omit over disabled tease when existence disclosure is sensitive).

## Example record types (product data, FX shell)

Personnel · Student · Occupancy · Inspection · Incident · Hydrant · Apparatus · Equipment · LOTO Procedure · Permit · and future types.

## Behavior principles

- Open into shared [Workspace Framework](./11-workspace-framework.md)
- Progressive disclosure: summary first, details on demand
- Status and priority never color-only
- Record Health surfaces “what needs attention”

## Anti-patterns

- Module-specific record pages that ignore workspace layout
- Forms-as-apps that bury title/status
- Mutable “history” presented as audit without audit semantics
- Client-only permission theater

## Related

- [11-workspace-framework.md](./11-workspace-framework.md)
- [15-forms-framework.md](./15-forms-framework.md)
- [18-timeline-framework.md](./18-timeline-framework.md)
- [28-workflow-framework.md](./28-workflow-framework.md)
