# FX Navigation Components

**Family:** Navigation  
**See also:** [09-navigation-framework.md](../09-navigation-framework.md), [13-search-framework.md](../13-search-framework.md)

Shared: token-driven; permission-gated destinations omitted (not shown as locked teasers when policy forbids existence disclosure).

| Component            | Purpose                                | Key variants / notes                                            |
| -------------------- | -------------------------------------- | --------------------------------------------------------------- |
| Primary Navigation   | Level-1 major work areas               | Vertical sidebar / top (portal modes); max work-oriented labels |
| Secondary Navigation | Level-2 modules                        | Nested under primary; collapse on phone                         |
| Breadcrumb           | Orient within ≤3 levels                | Collapse middle on narrow                                       |
| Quick Navigation     | Jump to frequent destinations          | Permission-filtered                                             |
| Recent Items         | Recently opened records                | Record-centered links                                           |
| Favorites            | User-pinned destinations               | Synced per account when platform supports                       |
| Product Switcher     | Move across RMS / Academy / Industrial | Same FX shell; product change only                              |
| Tenant Switcher      | Tenant context presentation            | Does not implement tenancy rules                                |
| User Menu            | Profile, theme, sign-out entry         | Platform owns auth actions                                      |
| Search Bar           | Global search entry                    | Expands / command palette hook                                  |
| Command Palette      | Keyboard-first search + commands       | Shortcut documented in search framework                         |

### Standard sections (each component)

- **Properties:** items/links, selected id, collapsed, callbacks
- **States:** default, hover, focus, active, disabled, loading
- **Permissions:** omit unauthorized items
- **Accessibility:** `nav` landmarks; current page via `aria-current`
- **Keyboard:** Tab + arrows per pattern; Enter/Space activate
- **Screen reader:** Group labels (“Primary”, “Modules”)
- **Responsive:** Rail → bottom nav / sheet on phone per shell mode
- **Examples:** Operations → Inspections → Workspace tabs
- **Anti-patterns:** Database-shaped menus (Collections, Tables, Data, Miscellaneous)
- **Future extension points:** Product registers destinations via FX nav config API
