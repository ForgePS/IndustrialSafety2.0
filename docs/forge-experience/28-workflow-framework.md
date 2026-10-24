# FX Workflow Framework

**Program:** Forge Experience (FX)  
**Version:** FX-S0  
**Status:** APPROVED (Part 3)

Workflow is standardized across every Forge product.

## Ownership

| Layer                                                                      | Owner                  |
| -------------------------------------------------------------------------- | ---------------------- |
| Shared state names, transition UX, audit/notification hooks (presentation) | **FX**                 |
| Business rule validation, entitlement, domain side effects                 | **Product / platform** |

Products may **extend** the state set.  
Products may **not** redefine the behavior of shared workflow states.

---

## Shared workflow states

| State        | Meaning (shared behavior)                 |
| ------------ | ----------------------------------------- |
| Draft        | Editable pre-submit work                  |
| Pending      | Submitted / awaiting pick-up              |
| Assigned     | Owned by an actor                         |
| In Progress  | Active work                               |
| Waiting      | Blocked on external dependency            |
| Needs Review | Awaiting review decision                  |
| Approved     | Affirmative decision complete             |
| Published    | Made available / issued                   |
| Completed    | Successful terminal (non-archive)         |
| Archived     | Retained, not active                      |
| Cancelled    | Stopped without completion                |
| Rejected     | Negative decision terminal                |
| Expired      | Time-bounded invalid                      |
| Deleted      | Removed per policy (usually soft + audit) |

Status presentation uses FX Status Badge tokens and labels. Do not invent synonyms that break cross-product literacy (for example renaming “Needs Review” to unrelated jargon in the shared badge).

---

## Transition contract

Every workflow transition shall include:

| Element                  | Requirement                           |
| ------------------------ | ------------------------------------- |
| Who                      | Actor identity                        |
| When                     | Timestamp                             |
| Why                      | Reason / comment when policy requires |
| Source State             | Prior state                           |
| Destination State        | New state                             |
| Audit Entry              | Written audit/timeline event          |
| Notification Trigger     | Evaluated (may no-op)                 |
| Permission Validation    | Server authoritative                  |
| Business Rule Validation | Product/platform rules                |

FX presents transition dialogs, busy states, failures, and resulting badges. FX does not bypass server validation.

## UX patterns

- Primary action advances the happy path
- Rejection/cancel use Confirmation Dialog + reason when required
- Illegal transitions are omitted, not shown as broken controls
- Timeline shows immutable transition events

## Anti-patterns

- Product A and Product B using the same label for different behaviors
- Silent state changes without audit
- Client-only “approved” flags
- Deep custom state machines that ignore shared states for common verbs

## Related

- [16-record-framework.md](./16-record-framework.md)
- [18-timeline-framework.md](./18-timeline-framework.md)
- [14-notification-framework.md](./14-notification-framework.md)
- [23-security-ux.md](./23-security-ux.md)
