# FX Search Framework (Global Search)

**Program:** Forge Experience (FX)  
**Version:** FX-S0  
**Status:** APPROVED (Part 2)

Global Search appears in **every** Forge product via the application shell.

## Supported result categories

- People
- Equipment
- Apparatus
- Occupancies
- Students
- Courses
- Inspections
- Incidents
- Hydrants
- Documents
- Policies
- Reports
- Tasks
- Messages

Products register which categories they publish. The UX remains identical.

## Supported capabilities

| Capability        | Behavior                                                                 |
| ----------------- | ------------------------------------------------------------------------ |
| Recent Searches   | Local/session list of prior queries                                      |
| Saved Searches    | Named queries when platform supports persistence                         |
| Favorites         | Jump to favorited records/destinations                                   |
| Command Palette   | Keyboard-first search + commands                                         |
| Keyboard Shortcut | Documented shell shortcut (product-consistent; e.g. `/` or `Ctrl/Cmd+K`) |

## Security UX (mandatory)

- Search must **gracefully hide inaccessible results** based on permissions.
- Search must **never reveal restricted records** (no “locked” rows that confirm existence when policy forbids).
- Authorization filtering is performed by platform/product services; FX presents only permitted hits.
- Empty results look the same for “none found” and “none you can see” when disclosure policy requires it.

## Behavior

1. Focus search → combobox pattern
2. Type query → grouped results by category
3. Arrow keys move; Enter opens
4. Esc clears/closes
5. Command palette mode can run actions (New inspection, Go to My Work) when permitted

## Accessibility

- Combobox + listbox semantics
- Announce result count politely
- Category headings as group labels
- Visible focus for every hit

## Responsive

- Desktop: popover under search bar
- Phone: full-screen search view
- Operations display: larger type, fewer chrome distractions

## Anti-patterns

- Product-specific search chrome
- Showing unauthorized teaser titles
- Mixing admin debug IDs into default results without a deliberate mono meta line

## Related

- [08-application-shell.md](./08-application-shell.md)
- [components/navigation.md](./components/navigation.md)
- [23-security-ux.md](./23-security-ux.md)
