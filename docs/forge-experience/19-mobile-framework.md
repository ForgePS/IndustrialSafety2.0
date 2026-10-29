# FX Mobile Framework

**Program:** Forge Experience (FX)  
**Version:** FX-S0  
**Status:** APPROVED (Part 4)  
**Author:** Forge Experience Program  
**Last Updated:** 2026-07-30

## Purpose

Make mobile and tablet first-class Forge experiences where operationally appropriate — not compressed desktops.

## Scope

Shared mobile/tablet behavior for shell, components, workspaces, My Work, forms, scanners, camera, GPS, and offline-aware UX across RMS, Academy, Industrial Safety, and future products.

## Goals

- Field users never have to zoom to use the application
- Touch-first interactions with minimum **44×44** CSS px targets
- Consistent behavior across phone, tablet, desktop, and large displays
- Operational clarity: what is happening, what needs attention, what to do next

## Definitions

| Term                       | Meaning                                                               |
| -------------------------- | --------------------------------------------------------------------- |
| Mobile-first (operational) | Design for field constraints first when the workflow is field-primary |
| Touch target               | Minimum interactive hit area 44×44 CSS px                             |
| Landscape-first (tablet)   | Prefer landscape compositions for apparatus/inspection tablets        |

## Responsibilities

| Owner    | Responsibility                                                                |
| -------- | ----------------------------------------------------------------------------- |
| FX       | Breakpoint behavior, touch patterns, component responsive contracts           |
| Product  | Domain content, camera/GPS payloads, offline sync rules via Offline Framework |
| Platform | Device permissions, push, hardware integrations                               |

## Required surface support

Every shared component must support:

- Desktop
- Tablet Landscape
- Tablet Portrait
- Phone Landscape
- Phone Portrait
- Large Display
- Digital Dashboard

Breakpoint tokens: see [05-design-tokens.md](./05-design-tokens.md) / `tokens/breakpoints.json`.

## Touch interactions

| Capability           | Standard                                                         |
| -------------------- | ---------------------------------------------------------------- |
| Minimum touch target | 44×44 CSS px                                                     |
| Swipe Actions        | Allowed on list rows with visible alternatives                   |
| Long Press           | Secondary actions / context; must have keyboard/mouse equivalent |
| Quick Actions        | FAB / sheet patterns on phone; shell quick actions on larger     |
| Offline Drafts       | Honest draft vs committed state (Offline Framework)              |
| Camera Integration   | Capture + permission-denied empty state                          |
| Photo Annotation     | Annotate then attach to record                                   |
| GPS Capture          | Explicit user action; accuracy shown when available              |
| QR Scanning          | Full-screen capture + manual fallback                            |
| Barcode Scanning     | Same + hardware wedge as future extension                        |
| Voice Dictation      | **Future** — reserved extension; do not invent per-product       |

## Tablet standards (primary field device)

Optimize for:

- Fire apparatus
- Inspection tablets
- Industrial safety tablets
- Training classrooms
- Hydrant surveys
- Preplans
- Incident review

Support:

- Split View
- Landscape-first layouts
- Floating action buttons
- Side panels
- Large data tables
- Stylus support
- Signature capture
- Offline synchronization indicators

## Best practices

- Prefer list → detail routes on phone over tiny dual panes
- Keep primary actions thumb-reachable
- Use token spacing; never shrink below touch minimums

## Anti-patterns

- Pinch-zoom required for primary tasks
- Hover-only affordances
- Product-specific mobile shells
- Scanner flows without manual fallback

## Future enhancements

- Voice dictation
- Rugged device density presets
- Glove-mode density token set

## Dependencies

- Design tokens · Application shell · Forms · Offline · Accessibility

## Implementation notes

Documentation and isolated prototypes only in FX-S0. No production shell replacement.

## Acceptance criteria

- [x] Mobile/tablet surfaces documented
- [x] 44×44 touch minimum mandated
- [x] Field capabilities listed with fallbacks
- [x] Tablet-as-primary-field-device standards captured

## Revision history

| Date       | Change                  |
| ---------- | ----------------------- |
| 2026-07-30 | Part 4 approved content |

## Related

- [20-offline-framework.md](./20-offline-framework.md)
- [08-application-shell.md](./08-application-shell.md)
- [21-accessibility.md](./21-accessibility.md)
