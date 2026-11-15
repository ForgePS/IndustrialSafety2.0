# FX Dashboard Widget Library

**Program:** Forge Experience (FX)  
**Version:** FX-S0  
**Status:** APPROVED (Part 3)  
**Parent:** [10-dashboard-framework.md](../10-dashboard-framework.md)  
**Template:** [_TEMPLATE.md](./_TEMPLATE.md)

Widgets are presentation shells. Products bind data providers; widgets never encode product business logic.

### Shared widget contract

| Section                 | Spec                                                            |
| ----------------------- | --------------------------------------------------------------- |
| Properties              | `id`, `title`, `size`, `collapsed`, `dataSourceRef`, `actions?` |
| Variants                | Compact · Standard · Wide (preset sizes only)                   |
| States                  | default, loading, empty, error, collapsed                       |
| Permissions             | Hidden when Creator/Tenant Admin/role/subscription disables     |
| Accessibility           | Titled region; critical visuals have text summary               |
| Keyboard                | Collapse/expand; action menus; layout edit keys when enabled    |
| Responsive              | Stack/full-width on phone; denser on ops display                |
| Anti-patterns           | Hard-coded product queries; unique chrome per product           |
| Future extension points | Register new widget **types** only through FX approval          |

---

## Widget catalog

| Widget                   | Purpose                                            |
| ------------------------ | -------------------------------------------------- |
| Metric Card              | Single KPI value (+ optional trend)                |
| Trend Chart              | Directional metric over time                       |
| Pie Chart                | Part-to-whole distribution                         |
| Bar Chart                | Category comparison                                |
| Line Chart               | Continuous series                                  |
| Queue Summary            | Counts/attention for a work queue                  |
| Recent Activity          | Latest events for role/context                     |
| Calendar                 | Schedule strip or month peek                       |
| Task List                | Actionable short task list                         |
| Map                      | Spatial situational awareness                      |
| Weather                  | Environmental context (non-critical)               |
| Critical Alerts          | Highest-severity attention items                   |
| Announcements            | Org/tenant announcements                           |
| Approval Queue           | Items awaiting approval                            |
| Upcoming Events          | Near-term events/deadlines                         |
| Compliance Summary       | Compliance posture metrics                         |
| Quick Actions            | Role-relevant creates/actions                      |
| Workload                 | Load distribution / capacity                       |
| Equipment Readiness      | Asset readiness snapshot                           |
| Personnel Availability   | Staffing / availability                            |
| Training Progress        | Training completion posture                        |
| Certification Expiration | Upcoming/expired certifications                    |
| Inspection Statistics    | Inspection volume/outcomes                         |
| Hydrant Statistics       | Hydrant program metrics                            |
| Incident Summary         | Open/recent incidents                              |
| Document Activity        | Recent document events                             |
| System Health            | Platform/ops health indicators (presentation only) |

Each widget composes FX data components (Metric Card, Chart, Map, Status Badge, etc.) and tokens from Part 2.
