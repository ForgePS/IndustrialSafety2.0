# Component Classification — Forge RMS

**Document:** `05-component-classification.md`  
**Verified:** 2026-07-30

## Classification legend

| Class                               | Meaning                                                  |
| ----------------------------------- | -------------------------------------------------------- |
| Shared FX Component                 | Use `@forge/fx-ui` (or icons) as-is                      |
| Shared FX Pattern                   | Use `@forge/fx-patterns`                                 |
| Shared FX Layout                    | Use `@forge/fx-layouts`                                  |
| RMS Product Extension               | Fire/NERIS/CAD-specific; keep in RMS; compose FX         |
| Temporary Compatibility Component   | Bridge until FX adoption; must have retirement condition |
| Legacy Component Pending Retirement | Exists; retire after acceptance + window                 |
| Unknown — Requires Review           | **Blocks** screen migration                              |

## Classifications

| Unit                               | Classification                                  | Retirement / notes                                                     |
| ---------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------- |
| `app-shell.tsx`                    | Temporary Compatibility → Shared FX Layout      | Retire when `fx.rms.shell.enabled` stable + accepted                   |
| Shell CSS modules                  | Legacy Pending Retirement                       | After FX shell tokens adopted                                          |
| `feature-gate.tsx`                 | Temporary Compatibility                         | Keep until FX empty/alert wrappers cover copy; may remain thin adapter |
| `require-auth.tsx`                 | RMS Product Extension                           | Auth behavior unchanged; presentation only later                       |
| `api-bootstrap.tsx`                | RMS Product Extension                           | Not presentation                                                       |
| `incident-workspace.tsx`           | RMS Product Extension + Shared FX Layout target | Compose `FxWorkspaceLayout` in S2D                                     |
| `incident-sections.tsx`            | RMS Product Extension                           | NERIS domain                                                           |
| `incident-cad-panel.tsx`           | RMS Product Extension                           | CAD domain                                                             |
| `officer-review.tsx`               | RMS Product Extension                           | High-risk workflow UI                                                  |
| `specialty-records.tsx`            | RMS Product Extension                           | Specialty permissions                                                  |
| `specialty-review.tsx`             | RMS Product Extension                           | Specialty permissions                                                  |
| `field-renderer.tsx`               | RMS Product Extension                           | Schema-driven; FX field chrome later                                   |
| `attachment-gallery.tsx`           | RMS Product Extension                           | May extract shared attachments later via governance                    |
| `ai-narrative-assistant-panel.tsx` | RMS Product Extension                           | AI product surface                                                     |
| `searchable-select.tsx`            | Temporary Compatibility                         | Replace with FX select when available; else govern new FX component    |
| `use-autosave`                     | RMS Product Extension                           | Behavior preserve                                                      |
| `use-tenant-config-studio`         | RMS Product Extension                           | Config Studio                                                          |
| `@forge/ui` EnvironmentBanner      | Temporary Compatibility                         | Prefer `FxEnvBanner` under FX shell flag                               |
| `@forge/design-system` CSS         | Legacy Pending Retirement                       | After FX tokens sole source                                            |
| `@forge/web-kit` ListControlsView  | Temporary Compatibility                         | Table migration S2E                                                    |
| `@forge/web-kit` auth/flags        | RMS Product Extension                           | Do not replace with FX                                                 |

## Totals

| Classification                                 | Count                    |
| ---------------------------------------------- | ------------------------ |
| Shared FX Component (target, not yet consumed) | 0 live / many candidates |
| Shared FX Pattern                              | 0 live                   |
| Shared FX Layout                               | 0 live                   |
| RMS Product Extension                          | 12                       |
| Temporary Compatibility Component              | 5                        |
| Legacy Component Pending Retirement            | 2 (CSS systems)          |
| Unknown — Requires Review                      | **0**                    |

## Shared FX reuse candidates (priority)

1. `FxAppShell` + breadcrumbs + env/offline indicators
2. `FxButton`, `FxAlert`, `FxEmptyState`, `FxStatusBadge`
3. `FxWorkspaceLayout` for incident record
4. `FxTable` / list adapters
5. `FxDialog` for review confirmations
6. Dashboard widgets (S2C) when metric surfaces exist

## Temporary compatibility expiration rules

| Component                            | Expiration condition                                                                 |
| ------------------------------------ | ------------------------------------------------------------------------------------ |
| Legacy `AppShell`                    | S2B accepted + rollback window complete + `fx.rms.shell.enabled` default-on approved |
| `EnvironmentBanner` from `@forge/ui` | FX shell ships `FxEnvBanner`                                                         |
| `searchable-select`                  | FX combobox exists in registry **or** governed RMS extension documented              |
| `ListControlsView` presentation      | S2E table acceptance                                                                 |
| FeatureGate presentation chrome      | FX alert/empty parity accepted                                                       |

## Rule enforcement

- Unknown classifications: **none blocking** for current screens.
- New UI discovered mid-migration must be classified before production use.
- Do not duplicate FX components inside RMS.
