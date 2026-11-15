# FX Navigation Framework

**Program:** Forge Experience (FX)  
**Version:** FX-S0  
**Status:** APPROVED (Part 2)

## Depth rule

**Maximum navigation depth is three visible levels.**

| Level   | Meaning         | Example               |
| ------- | --------------- | --------------------- |
| Level 1 | Major work area | Operations            |
| Level 2 | Module          | Inspections           |
| Level 3 | Workspace tabs  | Queue · Map · Reports |

Never exceed three visible navigation levels.  
Use **record tabs** instead of deeper navigation whenever possible.

## Organize around work — not database structure

### Do

- Operations
- Personnel
- Training
- Fleet
- Prevention
- Communications
- Administration

### Do not

- Collections
- Tables
- Settings (as a dumping ground)
- Miscellaneous
- Data
- System

Administration is allowed as a Level-1 **work area** for entitled admins; it still uses work-oriented module names (Users, Roles, Integrations) — not schema names.

## Behavior standards

- Primary + secondary nav share identical interaction across products
- Active route uses `aria-current="page"`
- Unauthorized destinations are omitted (prefer omit over disabled tease when disclosure is sensitive)
- Product Switcher changes product extension, not shell metaphor
- Breadcrumbs mirror the three-level IA only

## Responsive behavior

| Breakpoint                 | Nav presentation                                |
| -------------------------- | ----------------------------------------------- |
| Phone                      | Sheets / bottom nav; breadcrumbs collapse       |
| Tablet portrait            | Collapsible rail                                |
| Tablet landscape / desktop | Expanded sidebar                                |
| Operations display         | Optional simplified primary list; favor content |

## Anti-patterns

- Four-level trees
- Duplicate “Home” metaphors per module
- Schema-driven menus
- Different nav interaction models per product

## Related

- [08-application-shell.md](./08-application-shell.md)
- [04-information-architecture.md](./04-information-architecture.md)
- [components/navigation.md](./components/navigation.md)
