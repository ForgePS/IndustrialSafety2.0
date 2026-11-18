# FX Dashboard Framework

**Program:** Forge Experience (FX)  
**Version:** FX-S0  
**Status:** APPROVED (Part 3)

Every Forge product inherits the **same** dashboard framework.

## Ownership rule

| Layer                                              | Owner                |
| -------------------------------------------------- | -------------------- |
| Presentation, layout, widget chrome, interactivity | **Forge Experience** |
| Queries, metrics, domain meaning, business rules   | **Product**          |

Dashboard widgets shall **never** contain product-specific logic.  
Products supply the data. Forge Experience supplies the presentation.

## Role-aware and configurable

Widgets may be enabled or disabled by:

- Creator
- Tenant Administrator
- Role permissions
- Subscription tier

Configuration changes presentation availability only. Authorization and entitlement evaluation remain platform/product services; the dashboard framework presents the resulting widget set.

## Widget behavior (all dashboards)

Every widget supports:

- **Movable** — user or admin layout placement within FX grid rules
- **Collapsible** — progressive disclosure of dense content
- **Optionally resizable** — within approved size presets (not free-form chaos)

Widgets use FX data components (Metric Card, Chart, Map, etc.) and design tokens only.

---

## Dashboard types

### Executive Dashboard

**Designed for:** Fire Chiefs · Directors · Plant Managers · Academy Directors

**Displays:**

- KPIs
- Compliance
- Staffing
- Readiness
- Budget metrics
- Critical alerts
- Recent activity
- Trend analysis

**Tone:** Situational awareness and decision support — not task triage dumps.

### Operational Dashboard

**Designed for:** Battalion Chiefs · Company Officers · Shift Supervisors · Safety Managers · Lead Instructors

**Displays:**

- Current assignments
- Work queues
- Inspections
- Today’s schedule
- Pending reviews
- Open incidents
- Active classes
- Equipment status

**Tone:** What is happening, what needs attention, what to do next.

### Personal Dashboard

**Designed for:** Every user

**Displays:**

- My Work
- My schedule
- Notifications
- Training
- Tasks
- Approvals
- Recent activity
- Favorites
- Upcoming deadlines

**Tone:** Individual responsibilities and attention.

### Module Dashboard

**Purpose:** Module-specific metrics using the same FX widget chrome.

**Examples:** Fleet · Hydrants · Prevention · Training · LOTO · Academy · Personnel

Products register module dashboards; they do not invent alternate dashboard shells.

---

## Layout and density

- Built on `ResponsiveGrid` and dashboard breakpoint rules
- Operations Display: larger tiles, fewer chrome distractions
- Phone: stacked single column; collapsible widgets preferred
- Empty / loading / error states required for every widget slot

## Accessibility

- Widget titles as headings
- Charts/maps provide text alternatives when critical
- Keyboard reorder (when layout editing is enabled) must be operable without drag-only
- Status and priority never color-only

## Anti-patterns

- Embedding product business rules inside widget components
- One-off dashboard chrome per product
- Non-collapsible walls of charts
- Widgets that navigate via schema names (“Collections”, “Tables”)

## Related

- [components/dashboard-widgets.md](./components/dashboard-widgets.md)
- [10 companion: Design System Cards/Charts](./06-design-system.md)
- [12-my-work-framework.md](./12-my-work-framework.md)
- [08-application-shell.md](./08-application-shell.md)
