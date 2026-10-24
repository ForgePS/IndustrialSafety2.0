# FX Accessibility Standard

**Program:** Forge Experience (FX)  
**Version:** FX-S0  
**Status:** APPROVED (Part 4)  
**Author:** Forge Experience Program  
**Last Updated:** 2026-07-30

## Purpose

Make accessibility a design constraint for every shared component — not a retrofit.

## Scope

All FX tokens, components, patterns, shell, dashboards, workspaces, forms, tables, charts, and product extensions consuming FX.

## Goals

- Meet **WCAG 2.2 AA**
- Keyboard parity for essential workflows
- Screen-reader-compatible structure and names

## Target

**WCAG 2.2 Level AA**

## Required support (every shared component)

| Requirement                       | Standard                                                       |
| --------------------------------- | -------------------------------------------------------------- |
| Keyboard navigation               | All essential actions operable by keyboard                     |
| Logical tab order                 | Matches reading/operational order                              |
| Visible focus states              | `color.border.focus`; never remove outline without replacement |
| ARIA labels                       | When visible text is insufficient                              |
| Screen reader compatibility       | Correct roles/names/states                                     |
| High contrast mode                | High Contrast Theme via Theme Engine                           |
| Reduced motion                    | Honor `prefers-reduced-motion` → `motion.disabled`             |
| Scalable text                     | Layout tolerates text zoom without clipping critical actions   |
| Accessible color contrast         | AA for text and essential UI                                   |
| Error announcements               | Validation Summary + field errors                              |
| Required field announcements      | Required in text, not color alone                              |
| Accessible data tables            | Row/column headers                                             |
| Accessible charts where practical | Text/table alternative for critical charts                     |

## Responsibilities

| Owner   | Responsibility                                                              |
| ------- | --------------------------------------------------------------------------- |
| FX      | Component contracts, tokens, patterns                                       |
| Product | Domain content alternatives; no inaccessible custom controls when FX exists |
| QA      | Automated + manual a11y checks in adoption phases                           |

## Best practices

- Design with a11y in component specs first
- Status/priority always include text
- Dialogs trap focus and restore on close

## Anti-patterns

- “We’ll add ARIA later”
- Icon-only critical actions without names
- Color-only state
- Keyboard traps

## Future enhancements

- Formal axe/Playwright gates in FX package CI
- Screen-reader scenario library per pattern

## Dependencies

- Design tokens · Component library · Theme Engine

## Implementation notes

Documented in FX-S0; enforcement lands with shared component package adoption.

## Acceptance criteria

- [x] WCAG 2.2 AA target stated
- [x] Component requirements listed
- [x] “Designed in, not added later” rule stated

## Revision history

| Date       | Change                  |
| ---------- | ----------------------- |
| 2026-07-30 | Part 4 approved content |

## Related

- [05-design-tokens.md](./05-design-tokens.md)
- [07-component-library.md](./07-component-library.md)
- [29-theme-engine.md](./29-theme-engine.md)
