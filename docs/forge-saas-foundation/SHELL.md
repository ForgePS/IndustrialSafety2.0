# Application Shell (MK-S8)

Multi-track shell strategy: **behaviors** are shared; **visual chrome** stays product-owned (BACKLOG-009).

## Tracks

| Track    | App                           | Shell                         |
| -------- | ----------------------------- | ----------------------------- |
| Forge UI | Creator Console, Tenant Admin | `ForgeAppShell` (`@forge/ui`) |
| Sneat    | Industrial                    | `IndustrialShell`             |

**Industrial visual SoT:** Sneat Free 1.0.0 palette/typography/chrome ([industrial-visual-source-of-truth.md](../design/industrial-visual-source-of-truth.md)). Do **not** retheme to Firebase green/Inter or treat Firebase visual delta as a defect. DATA PARITY ≠ VISUAL PARITY.
| FX / legacy | RMS | `RmsShellBoundary` / FX layouts |

Do **not** force a Makerkit redesign or a single CSS framework across products.

## Required chrome (directive)

| Area                               | `@forge/ui`                              | Creator / Tenant Admin       | Industrial (Sneat)                                        |
| ---------------------------------- | ---------------------------------------- | ---------------------------- | --------------------------------------------------------- |
| Responsive sidebar + mobile drawer | `ForgeAppShell` / `ForgeSidebar`         | Yes                          | Yes                                                       |
| Top bar                            | `ForgeTopbar`                            | Yes                          | Yes                                                       |
| Tenant switcher                    | `ForgeTenantSwitcher`                    | Yes                          | Yes                                                       |
| Product switcher                   | `ForgeProductSwitcher`                   | Yes (session products)       | Product gate on session                                   |
| Facility selector                  | `ForgeFacilitySelector`                  | Empty stub until catalog API | Shows when facilities API returns rows; hidden when empty |
| Breadcrumb / page title            | `ForgeBreadcrumbs` / `ForgePageHeader`   | Profile + pages              | In-module                                                 |
| Notification icon                  | `ForgeNotificationMenu` (disabled stub)  | Yes                          | Deferred                                                  |
| Search trigger                     | `ForgeSearchTrigger` (disabled → MK-S18) | Yes                          | Hidden until connected                                    |
| Profile menu                       | `ForgeUserMenu` + `/profile`             | Yes                          | Yes                                                       |
| Help / settings                    | `ForgeHelpMenu` + settings links         | Yes                          | Help hidden; Settings hub = live links only               |

## Shell area states

`ForgeShellState` supports:

```text
loading | empty | error | unauthorized | disabled_entitlement | ready
```

Chrome controls also accept matching `state` props where list-driven (tenant/product/facility).

## Navigation entitlements

Prefer `filterNavigationForSession` from `@forge/web-kit` (permissions + products + modules). Creator Console uses it; Tenant Admin passes `modules` into `filterNavigationGroups`.

## Out of scope / deferred

- Notification delivery (BACKLOG-004 / 018)
- Command palette search (MK-S18)
- Creator auth → full web-kit consolidation (BACKLOG-008)
- RMS FX default-on / restyle
- Facility ACL enforcement (BACKLOG-016)
