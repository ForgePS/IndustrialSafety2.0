# Component Inventory — Forge RMS

**Document:** `04-component-inventory.md`  
**Verified:** 2026-07-30  
**Scope:** `apps/rms-web/src` presentation units + shared packages consumed

## Local components (`src/components`)

| Component file                     | Purpose                                             | Consumers          |
| ---------------------------------- | --------------------------------------------------- | ------------------ |
| `app-shell.tsx`                    | Application shell, primary nav, session, env banner | Root layout        |
| `feature-gate.tsx`                 | Feature-flag gate UI                                | Feature pages      |
| `require-auth.tsx`                 | Client auth redirect                                | Incidents layout   |
| `api-bootstrap.tsx`                | API client bootstrap                                | Root layout        |
| `incident-workspace.tsx`           | Incident workspace chrome/sections host             | Workspace client   |
| `incident-sections.tsx`            | Section field groups                                | Workspace          |
| `incident-cad-panel.tsx`           | CAD linkage panel                                   | Workspace          |
| `officer-review.tsx`               | Review actions UI                                   | Review + workspace |
| `specialty-records.tsx`            | Specialty record editors                            | Workspace          |
| `specialty-review.tsx`             | Specialty review UI                                 | Workspace          |
| `field-renderer.tsx`               | Dynamic field rendering                             | Sections/forms     |
| `attachment-gallery.tsx`           | Attachments                                         | Workspace          |
| `ai-narrative-assistant-panel.tsx` | AI narrative                                        | Narrative section  |
| `searchable-select.tsx`            | Combobox/select                                     | Forms              |

## Local hooks

| Hook                          | Purpose                                          |
| ----------------------------- | ------------------------------------------------ |
| `use-autosave.tsx`            | Draft autosave                                   |
| `use-tenant-config-studio.ts` | Config Studio namespaces (terminology/nav/roles) |

## Local styles

| File                   | Purpose                  |
| ---------------------- | ------------------------ |
| `app/shell.module.css` | Shell / nav              |
| `app/page.module.css`  | Page utilities / buttons |

## Shared packages consumed

| Package                | Usage in RMS                                        |
| ---------------------- | --------------------------------------------------- |
| `@forge/web-kit`       | Auth, API, feature flags, `ListControlsView`, OAuth |
| `@forge/design-system` | Global CSS tokens/styles                            |
| `@forge/ui`            | `EnvironmentBanner` only                            |
| `@forge/contracts`     | Types/permissions (via API shapes)                  |
| `@forge/fx-*`          | **None**                                            |

## Duplicated / parallel concepts vs FX

| RMS today                    | FX candidate               | Notes                                        |
| ---------------------------- | -------------------------- | -------------------------------------------- |
| `app-shell.tsx`              | `FxAppShell`               | Replace behind `fx.rms.shell.enabled` in S2B |
| Local nav CSS                | FX nav patterns            | Map groups → 3-level IA                      |
| `page.module.css` buttons    | `FxButton`                 | Gradual                                      |
| Feature disabled panels      | `FxEmptyState` / `FxAlert` | Compatibility wrapper                        |
| `field-renderer`             | FX forms + RMS extension   | Keep domain logic                            |
| `ListControlsView` (web-kit) | `FxTable` + adapters       | Do not drop list features                    |
| Incident workspace chrome    | `FxWorkspaceLayout`        | S2D                                          |
| Metric-less home             | `FxMetricCard` / charts    | S2C when dashboards exist                    |
| Env banner `@forge/ui`       | `FxEnvBanner`              | Compatibility dual-mount possible            |

## Deprecated components

None formally marked deprecated inside `rms-web`. Legacy Firebase RMS components live outside this app.

## Unknown components

None among inventoried local files — all classified in `05`.
