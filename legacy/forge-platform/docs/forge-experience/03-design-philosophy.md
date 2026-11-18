# FX Design Philosophy

**Program:** Forge Experience (FX)  
**Version:** FX-S0  
**Status:** APPROVED

## Design feeling

Forge Experience must feel like:

- Mission Control
- Emergency Operations Center
- Modern public safety platform
- Industrial operations center

Not:

- Spreadsheet software
- Legacy government software
- Generic CRM
- Form builder
- Database viewer

## Core principles

### Operational first

Every screen must answer:

1. What is happening?
2. What needs attention?
3. What should I do next?

### Role driven

Users should work from their responsibilities.  
Never from database collections.

### Record centered

Everything revolves around a record.

Examples:

- Personnel
- Student
- Occupancy
- Inspection
- Incident
- Hydrant
- Apparatus
- Equipment
- LOTO Procedure
- Permit

Forms should support records.  
Forms must never become the application.

### Consistency

These must behave identically across products:

- Buttons
- Tables
- Forms
- Dialogs
- Navigation
- Search
- Reports

### Progressive disclosure

- Show summaries.
- Expand only when requested.
- Never overwhelm users.

### Accessibility

Everything must target **WCAG 2.2 AA**.

### Responsive / multi-surface

These are first-class experiences:

- Desktop
- Tablet
- Mobile
- Large dashboard displays

## Design implications

| Principle              | Implication                                                                       |
| ---------------------- | --------------------------------------------------------------------------------- |
| Operational first      | Dashboards and My Work prioritize attention and next action over dense data dumps |
| Role driven            | Navigation and home experiences are responsibility-based                          |
| Record centered        | Record framework is primary; forms and reports are secondary lenses               |
| Consistency            | Component library and pattern library are mandatory                               |
| Progressive disclosure | Summaries, drawers, and expandable sections are preferred over mega-pages         |
| Accessibility          | Tokens, components, and patterns are designed with AA constraints from the start  |
| Multi-surface          | Shell, navigation, and frameworks define desktop, tablet, and mobile behaviors    |

## Anti-patterns

- Spreadsheet-first screens as the default work mode
- Menu trees that mirror database schemas
- Forms that bury the record identity and status
- One-off dialogs and buttons per product
- Accessibility bolted on after visual design
- Mobile as a compressed afterthought of desktop
