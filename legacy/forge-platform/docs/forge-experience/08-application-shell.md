# FX Application Shell

**Program:** Forge Experience (FX)  
**Version:** FX-S0  
**Status:** APPROVED (Part 2)

Every Forge product inherits **one** shared application shell. Products supply destinations, records, and domain tools — not alternate chrome.

## Shell includes

| Element                | Role                                                     |
| ---------------------- | -------------------------------------------------------- |
| Product Logo           | Forge + product lockup                                   |
| Tenant Selector        | Tenant context presentation                              |
| Environment Indicator  | Dev / test / stage / prod-like (non-prod highly visible) |
| Global Search          | Universal find + command palette entry                   |
| Notifications          | Attention inbox entry                                    |
| My Work                | Responsibility queue entry                               |
| User Menu              | Account, theme, sign-out entry                           |
| Help                   | Help / docs entry                                        |
| Quick Actions          | Role-relevant creates/actions                            |
| Breadcrumb             | ≤3 level orientation                                     |
| Primary Navigation     | Level-1 work areas                                       |
| Secondary Navigation   | Level-2 modules                                          |
| Content Area           | Main workspace                                           |
| Status Bar             | Footer operational status                                |
| Connection Indicator   | Online / degraded                                        |
| Offline Indicator      | Offline / sync pending                                   |
| Subscription Indicator | Entitlement presentation (when applicable)               |
| Creator Tools          | Creator portal tools slot                                |
| Audit Shortcut         | Jump to audit views when permitted                       |
| Support Shortcut       | Support entry                                            |

## Layout

```text
┌──────────────────────────────────────────────────────────────┐
│ Top Header: Logo · Tenant · Env · Search · My Work · Alerts │
│             · Quick Actions · Help · User                    │
├──────────────┬─────────────────────────────────┬─────────────┤
│ Left         │ Main Workspace                  │ Optional    │
│ Primary Nav  │ Breadcrumb                      │ Right       │
│ Secondary    │ Page / Workspace / Record       │ Context     │
│ Nav          │ Content Area                    │ Panel       │
├──────────────┴─────────────────────────────────┴─────────────┤
│ Footer Status: Connection · Offline · Subscription · Meta    │
└──────────────────────────────────────────────────────────────┘
```

- **Top Header** — global identity and attention
- **Left Navigation** — work-oriented IA
- **Main Workspace** — product content
- **Optional Right Context Panel** — peek details, help, filters
- **Footer Status** — connectivity and environment truth

## Modes supported

| Mode                   | Behavior highlights                                        |
| ---------------------- | ---------------------------------------------------------- |
| Desktop                | Full header + left nav + optional context                  |
| Tablet                 | Collapsible nav rail; touch targets                        |
| Phone                  | Bottom or sheet nav; full-screen search; FAB quick actions |
| Public Portal          | Minimal chrome; no admin tools                             |
| Employee Portal        | Standard shell; role nav                                   |
| Creator Portal         | Creator Tools visible when entitled                        |
| Administration Portal  | Admin destinations; stronger env indicator                 |
| Digital Dashboard Mode | Simplified chrome; large tiles; read-heavy                 |
| Kiosk Mode             | Locked session presentation; limited user menu             |
| Full Screen Operations | Minimal chrome; max content; ops display breakpoint        |

## Theme

Shell root sets `data-fx-theme="light|dark"` and hosts CSS variables. All child components inherit tokens.

## Non-ownership

Shell does **not** implement authentication, authorization, tenant isolation, or subscription billing logic. It presents states supplied by the platform.

## Related

- [components/foundation.md](./components/foundation.md#appshell)
- [09-navigation-framework.md](./09-navigation-framework.md)
- [13-search-framework.md](./13-search-framework.md)
- [12-my-work-framework.md](./12-my-work-framework.md)
- [14-notification-framework.md](./14-notification-framework.md)
