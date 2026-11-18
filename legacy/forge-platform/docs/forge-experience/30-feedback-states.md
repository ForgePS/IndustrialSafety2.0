# FX Feedback States — Errors, Empty, Loading

**Program:** Forge Experience (FX)  
**Version:** FX-S0  
**Status:** APPROVED (Part 4)  
**Author:** Forge Experience Program  
**Last Updated:** 2026-07-30

## Purpose

Standardize error, empty, and loading experiences so every product feels consistent and recoverable.

## Scope

Full-page, panel, inline, and toast-level feedback using FX components and tokens.

## Goals

- Preserve layout stability
- Avoid page jumping
- Replace generic “Something went wrong.” with actionable copy

---

## Error handling standards

Every error shall provide:

| Element                        | Required                       |
| ------------------------------ | ------------------------------ |
| Clear title                    | Yes                            |
| Human-readable explanation     | Yes                            |
| Suggested resolution           | Yes                            |
| Technical details (expandable) | Yes when available             |
| Reference ID                   | Yes (correlation / request id) |
| Support link                   | Yes when channel exists        |
| Retry action                   | When appropriate               |

### Avoid

- “Something went wrong.”
- Stack traces in primary UI
- Blameful copy

### Examples

- **Title:** Unable to save inspection
- **Explanation:** The connection dropped before the server confirmed your changes.
- **Resolution:** Check connectivity, then retry. Your draft is still on this device if offline drafts are enabled.
- **Reference ID:** `a1b2c3…`

---

## Empty state standards

Every empty screen should explain:

1. Why it is empty
2. How to populate it
3. Available actions
4. Relevant permissions (when denial is the cause)

### Examples

- “No inspections have been assigned.”
- “No students match your filters.”
- “You don't have permission to view this data.”

### Variants

No data · No results · No access · First-run

---

## Loading standards

Support:

| Pattern             | Use                                         |
| ------------------- | ------------------------------------------- |
| Skeleton Screens    | Content regions; preserve layout            |
| Progress Indicators | Determinate when known; labeled             |
| Background Loading  | Non-blocking refresh                        |
| Lazy Loading        | Below-fold / secondary panels               |
| Infinite Scroll     | Where appropriate; always provide end state |

### Rules

- Loading states must preserve layout stability
- Avoid page jumping
- Prefer skeletons over full-page spinners for content areas
- Mark `aria-busy` appropriately; don’t announce every shimmer

---

## Responsibilities

| Owner    | Responsibility                        |
| -------- | ------------------------------------- |
| FX       | Patterns, components, copy guidelines |
| Product  | Domain-specific resolution hints      |
| Platform | Reference IDs, support URLs           |

## Anti-patterns

- Blank white voids
- Layout shift from late banners
- Infinite scroll without “end of results”

## Future enhancements

- Shared error code → copy catalog

## Dependencies

- Design system · Security UX · Offline banners

## Implementation notes

Documented for FX-S0; implement with shared UI package later.

## Acceptance criteria

- [x] Error anatomy defined
- [x] Empty state rules + examples
- [x] Loading patterns + layout stability rule

## Revision history

| Date       | Change                  |
| ---------- | ----------------------- |
| 2026-07-30 | Part 4 approved content |

## Related

- [06-design-system.md](./06-design-system.md)
- [23-security-ux.md](./23-security-ux.md)
- [24-pattern-library.md](./24-pattern-library.md)
