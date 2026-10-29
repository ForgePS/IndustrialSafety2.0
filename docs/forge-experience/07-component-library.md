# FX Component Library

**Program:** Forge Experience (FX)  
**Version:** FX-S0  
**Status:** APPROVED (Part 2)  
**Spec template:** [`components/_TEMPLATE.md`](./components/_TEMPLATE.md)

Every shared component is documented. Products consume these components; they do not fork them.

## Documentation rule

Each component includes: Purpose · Properties · Variants · States · Permissions · Accessibility · Keyboard · Screen reader · Responsive · Examples · Anti-patterns · Future extension points.

Family overviews live in `components/`. Individual deep specs are added as implementation proceeds; operational cards share [`components/operational-cards.md`](./components/operational-cards.md).

---

## Foundation components

| Component       | Spec                                                        |
| --------------- | ----------------------------------------------------------- |
| AppShell        | [foundation.md](./components/foundation.md#appshell)        |
| PageHeader      | [foundation.md](./components/foundation.md#pageheader)      |
| SectionHeader   | [foundation.md](./components/foundation.md#sectionheader)   |
| ContentPanel    | [foundation.md](./components/foundation.md#contentpanel)    |
| WorkspaceHeader | [foundation.md](./components/foundation.md#workspaceheader) |
| SummaryPanel    | [foundation.md](./components/foundation.md#summarypanel)    |
| Sidebar         | [foundation.md](./components/foundation.md#sidebar)         |
| Toolbar         | [foundation.md](./components/foundation.md#toolbar)         |
| Footer          | [foundation.md](./components/foundation.md#footer)          |
| SplitView       | [foundation.md](./components/foundation.md#splitview)       |
| ResponsiveGrid  | [foundation.md](./components/foundation.md#responsivegrid)  |
| WorkspaceTabs   | [foundation.md](./components/foundation.md#workspacetabs)   |

## Navigation components

| Component            | Spec                                        |
| -------------------- | ------------------------------------------- |
| Primary Navigation   | [navigation.md](./components/navigation.md) |
| Secondary Navigation | [navigation.md](./components/navigation.md) |
| Breadcrumb           | [navigation.md](./components/navigation.md) |
| Quick Navigation     | [navigation.md](./components/navigation.md) |
| Recent Items         | [navigation.md](./components/navigation.md) |
| Favorites            | [navigation.md](./components/navigation.md) |
| Product Switcher     | [navigation.md](./components/navigation.md) |
| Tenant Switcher      | [navigation.md](./components/navigation.md) |
| User Menu            | [navigation.md](./components/navigation.md) |
| Search Bar           | [navigation.md](./components/navigation.md) |
| Command Palette      | [navigation.md](./components/navigation.md) |

## Action components

| Component                           | Spec                                  |
| ----------------------------------- | ------------------------------------- |
| Primary / Secondary / Danger Button | [actions.md](./components/actions.md) |
| Icon Button                         | [actions.md](./components/actions.md) |
| Floating Action Button              | [actions.md](./components/actions.md) |
| Action Menu                         | [actions.md](./components/actions.md) |
| Confirmation Dialog                 | [actions.md](./components/actions.md) |
| Quick Actions                       | [actions.md](./components/actions.md) |

## Form components

See [forms.md](./components/forms.md): Text Field, Text Area, Date/Time pickers, Dropdown, Multi Select, Checkbox, Radio Group, Toggle, Slider, Tag Selector, Lookup fields (Person, Equipment, Record, Address), Image/Document Upload, Signature Capture, QR/Barcode Scanner, Wizard, Stepper, Validation Summary.

## Data components

See [data.md](./components/data.md): Table, Virtual Table, Record/Metric/Dashboard Card, Timeline, Audit Log, Attachment Viewer, Gallery, Map, Weather Widget, Chart, Progress Indicator, Status/Priority Badge, Identity Card, Avatar.

## Operational components

See [operational-cards.md](./components/operational-cards.md): Task, Inspection, Incident, Occupancy, Hydrant, Fleet, Apparatus, Student, Training, Certification, Violation, Permit cards.

## Dashboard widgets

See [dashboard-widgets.md](./components/dashboard-widgets.md): Metric Card, charts, queues, calendar, map, alerts, compliance, readiness, training/certification/inspection/hydrant/incident stats, system health, and more.

---

## Related

- [05-design-tokens.md](./05-design-tokens.md)
- [06-design-system.md](./06-design-system.md)
- [08-application-shell.md](./08-application-shell.md)
- [10-dashboard-framework.md](./10-dashboard-framework.md)
