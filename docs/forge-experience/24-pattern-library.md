# FX Pattern Library

**Program:** Forge Experience (FX)  
**Version:** FX-S0  
**Status:** APPROVED (Part 4)  
**Author:** Forge Experience Program  
**Last Updated:** 2026-07-30

## Purpose

Reusable interaction patterns so every product solves the same jobs the same way.

## Scope

Cross-product flows composed from FX components and frameworks. Specs live under [`patterns/`](./patterns/).

## Goals

- One pattern per common job
- Products reuse before inventing
- Patterns encode progressive disclosure and operational-first UX

## Pattern catalog

| Pattern                   | Job                                      |
| ------------------------- | ---------------------------------------- |
| Create Record             | Start a new record via workspace/forms   |
| Edit Record               | Edit without losing record identity      |
| Delete Record             | Destructive confirm + audit              |
| Archive Record            | Soft end-of-life                         |
| Restore Record            | Return from archive                      |
| Approve Workflow          | Shared approve transition                |
| Reject Workflow           | Shared reject + reason                   |
| Assign Work               | Assign/reassign with permissions         |
| Bulk Edit                 | Multi-select edit with per-item auth     |
| Bulk Import               | Import Center / FX import entry patterns |
| Bulk Export               | Export with audit metadata               |
| Upload Files              | Attachments/photos to record             |
| Search                    | Global + local search                    |
| Advanced Search           | Saved/complex criteria                   |
| Filter Builder            | Composable filters/chips                 |
| Wizard                    | Multi-step form chrome                   |
| Timeline Review           | Immutable timeline inspection            |
| Audit Review              | Audit-oriented review                    |
| Dashboard Personalization | Move/collapse/resize widgets             |

## Pattern document requirements

Each pattern file includes the FX documentation template (Purpose through Revision History). See [31-documentation-standards.md](./31-documentation-standards.md).

## Best practices

- Link patterns to workflow states and record operations
- Prefer omit unauthorized actions

## Anti-patterns

- Product-only forks of Create/Edit/Approve
- Bulk actions without per-item permission checks

## Future enhancements

- Full wireframed sequence for each pattern
- Prototype links in `prototypes/`

## Dependencies

- Component library · Workflow · Record · Forms · Dashboard

## Implementation notes

Seed pattern stubs created in `patterns/`. Deep wireframes are FX-S0 deliverable placeholders.

## Acceptance criteria

- [x] Catalog complete for FX-S0 list
- [x] Reuse mandate stated
- [x] Stub specs present under `patterns/`

## Revision history

| Date       | Change                 |
| ---------- | ---------------------- |
| 2026-07-30 | Part 4 pattern catalog |

## Related

- [28-workflow-framework.md](./28-workflow-framework.md)
- [16-record-framework.md](./16-record-framework.md)
- [patterns/README.md](./patterns/README.md)
