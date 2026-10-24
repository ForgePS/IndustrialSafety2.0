# FX Security UX Standards

**Program:** Forge Experience (FX)  
**Version:** FX-S0  
**Status:** APPROVED (Part 4)  
**Author:** Forge Experience Program  
**Last Updated:** 2026-07-30

## Purpose

Make security visible without unnecessary friction. Users should always know **why** an action is unavailable.

## Scope

Presentation of security and entitlement states in shell, records, actions, search, and forms. AuthN/Z backends remain platform.

## Goals

- Never silently disable functionality
- Fail closed with clear next action
- Do not leak restricted record existence against policy

## Standard states

| State                | Meaning                  | UX                                        |
| -------------------- | ------------------------ | ----------------------------------------- |
| Read Only            | View allowed; mutate not | Controls read-only; explanation available |
| Restricted           | Limited fields/actions   | Omitted or masked per policy              |
| Locked               | Explicit lock            | Lock indicator + who/why when permitted   |
| Pending Approval     | Awaiting decision        | Status + approval queue affordances       |
| Requires Permission  | Missing entitlement      | Omitted or disabled **with reason**       |
| Expired Session      | Session ended            | Re-auth interstitial                      |
| Subscription Expired | Entitlement lapsed       | Blocking banner + support path            |
| Maintenance Mode     | System unavailable       | Full-page maintenance                     |
| Environment Banner   | Non-prod / special env   | Persistent shell banner                   |

## Rules

1. Prefer **omit** unauthorized destinations when existence disclosure is sensitive.
2. If shown disabled, always provide accessible reason text.
3. Never silently disable.
4. Security UX does not implement authorization decisions.

## Best practices

- Pair Requires Permission with Help/Support shortcut when appropriate
- Environment banners use warning tokens; never subtle

## Anti-patterns

- Greyed controls with no explanation
- Client-only unlocks
- “Contact admin” with no context

## Future enhancements

- Standardized reason codes catalog

## Dependencies

- Shell · Empty states · Error handling · Notifications

## Implementation notes

Presentation contracts only in FX-S0.

## Acceptance criteria

- [x] Standard states listed
- [x] No silent disable rule stated

## Revision history

| Date       | Change                  |
| ---------- | ----------------------- |
| 2026-07-30 | Part 4 approved content |

## Related

- [08-application-shell.md](./08-application-shell.md)
- [30-feedback-states.md](./30-feedback-states.md)
- [13-search-framework.md](./13-search-framework.md)
