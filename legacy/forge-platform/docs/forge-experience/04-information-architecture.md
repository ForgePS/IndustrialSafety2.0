# FX Information Architecture

**Program:** Forge Experience (FX)  
**Version:** FX-S0  
**Status:** APPROVED (Part 4)  
**Author:** Forge Experience Program  
**Last Updated:** 2026-07-30

## Purpose

Define the shared mental model so users never relearn where work lives.

## Scope

Shell navigation, workspaces, dialogs, and cross-product IA rules.

## Goals

- Navigation exists for users — not developers
- Never create navigation solely because a database contains another table

## Definitions

| Layer                | Represents                  |
| -------------------- | --------------------------- |
| Primary Navigation   | **Work** (major work areas) |
| Secondary Navigation | **Modules**                 |
| Workspace Tabs       | **Record context**          |
| Dialogs              | **Short interactions**      |

## Responsibilities

| Owner   | Responsibility                          |
| ------- | --------------------------------------- |
| FX      | IA rules, depth limits, naming patterns |
| Product | Destination registration within rules   |

## IA rules

1. Primary nav = work areas (Operations, Personnel, Training, Fleet, Prevention, Communications, Administration, …).
2. Secondary nav = modules under a work area.
3. Workspace tabs = record context (Overview, Details, Timeline, …).
4. Dialogs = short interactions — not primary navigation.
5. Maximum **three** visible navigation levels ([09-navigation-framework.md](./09-navigation-framework.md)).
6. Prefer record tabs over deeper trees.

## Do / Do not

**Do:** Operations · Personnel · Training · Fleet · Prevention · Communications · Administration

**Do not:** Collections · Tables · Settings-as-dumping-ground · Miscellaneous · Data · System

## Examples

- Operations → Inspections → Workspace tabs (Queue / Map / Reports)
- Open inspection → Overview / Details / Timeline tabs

## Best practices

- Name destinations by user jobs
- Hide unauthorized destinations per Security UX

## Anti-patterns

- Schema-driven menus
- Four-plus nav levels
- Dialogs used as apps

## Future enhancements

- Cross-product IA dictionary

## Dependencies

- Navigation · Workspace · Shell · Search

## Implementation notes

Docs only in FX-S0.

## Acceptance criteria

- [x] Layer meanings defined
- [x] Anti-schema rule stated

## Revision history

| Date       | Change          |
| ---------- | --------------- |
| 2026-07-30 | Part 4 IA rules |

## Related

- [09-navigation-framework.md](./09-navigation-framework.md)
- [11-workspace-framework.md](./11-workspace-framework.md)
- [08-application-shell.md](./08-application-shell.md)
