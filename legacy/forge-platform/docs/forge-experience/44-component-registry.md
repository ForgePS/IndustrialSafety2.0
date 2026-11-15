# 44 — Forge Experience Component Registry

**Document:** `docs/forge-experience/44-component-registry.md`  
**Authority:** Authoritative catalog of shared FX components  
**Version baseline:** Design System `v1.0.0-RC1`  
**Last Updated:** 2026-07-30  
**Governance:** [39-component-governance.md](./39-component-governance.md)

Any new shared component discovered during RMS migration must be added here **before** production use.

## Stability levels

`Experimental` · `RC` · `Stable` · `Deprecated` · `Retired`

## Registry entries

### Design tokens

| Field              | Value                                                                         |
| ------------------ | ----------------------------------------------------------------------------- |
| Component name     | FX Design Tokens                                                              |
| Package            | `@forge/fx-design-tokens`                                                     |
| Export name        | `applyFxTheme`, `fxSpace`, `fxBreakpoints`, `FX_THEME_ATTR`, CSS `styles.css` |
| Purpose            | Token source + theme attribute application                                    |
| Stability          | RC                                                                            |
| Current version    | 1.0.0-rc.1                                                                    |
| Owner              | Forge Experience                                                              |
| Documentation      | `docs/forge-experience/05-design-tokens.md`, `tokens/`                        |
| Playground         | Reference app theme switcher                                                  |
| Accessibility      | Themes include high-contrast                                                  |
| Test status        | Typecheck / consumed by reference                                             |
| Products consuming | Reference app; RMS planned S2B+                                               |
| Extension points   | Semantic token files                                                          |
| Known limitations  | Safari color-mix fallbacks pending for broad GA                               |
| Planned changes    | Solid fallbacks; stable 1.0.0 after S2 pilot                                  |
| Last reviewed      | 2026-07-30                                                                    |
| Deprecation        | None                                                                          |

### Utils

| Field             | Value                    |
| ----------------- | ------------------------ |
| Component name    | `cn`                     |
| Package           | `@forge/fx-utils`        |
| Export name       | `cn`                     |
| Purpose           | Class name composition   |
| Stability         | RC                       |
| Current version   | 1.0.0-rc.1               |
| Owner             | Forge Experience         |
| Documentation     | Package README / S1 docs |
| Playground        | n/a                      |
| Accessibility     | n/a                      |
| Test status       | Typecheck                |
| Products          | Reference; RMS planned   |
| Extension points  | None                     |
| Known limitations | None                     |
| Planned changes   | None                     |
| Last reviewed     | 2026-07-30               |
| Deprecation       | None                     |

### Icons

| Name             | Package           | Export             | Purpose       | Stability | Version    | A11y       | Tests     | Products  | Limitations | Last reviewed | Deprecation |
| ---------------- | ----------------- | ------------------ | ------------- | --------- | ---------- | ---------- | --------- | --------- | ----------- | ------------- | ----------- |
| IconSearch       | `@forge/fx-icons` | `IconSearch`       | Search glyph  | RC        | 1.0.0-rc.1 | title prop | typecheck | Reference | Minimal set | 2026-07-30    | None        |
| IconBell         | `@forge/fx-icons` | `IconBell`         | Notifications | RC        | 1.0.0-rc.1 | title      | typecheck | Reference | Minimal set | 2026-07-30    | None        |
| IconMenu         | `@forge/fx-icons` | `IconMenu`         | Menu          | RC        | 1.0.0-rc.1 | title      | typecheck | Reference | Minimal set | 2026-07-30    | None        |
| IconChevronRight | `@forge/fx-icons` | `IconChevronRight` | Chevron       | RC        | 1.0.0-rc.1 | title      | typecheck | Reference | Minimal set | 2026-07-30    | None        |
| IconPlus         | `@forge/fx-icons` | `IconPlus`         | Add           | RC        | 1.0.0-rc.1 | title      | typecheck | Reference | Minimal set | 2026-07-30    | None        |
| IconCheck        | `@forge/fx-icons` | `IconCheck`        | Success       | RC        | 1.0.0-rc.1 | title      | typecheck | Reference | Minimal set | 2026-07-30    | None        |
| IconAlert        | `@forge/fx-icons` | `IconAlert`        | Alert         | RC        | 1.0.0-rc.1 | title      | typecheck | Reference | Minimal set | 2026-07-30    | None        |

Owner: Forge Experience · Docs: icons package · Playground: `/playground` · Extension: add icons via governance · Planned: expand set as products need.

### UI primitives & widgets (`@forge/fx-ui` 1.0.0-rc.1)

Common fields unless noted: Owner FX · Docs `07` + `43` · Playground `http://localhost:3010/playground` · Products: Reference; RMS planned · Deprecation: None · Reviewed 2026-07-30 · Stability: **RC**

| Component         | Export                  | Purpose         | A11y               | Tests            | Extension points | Known limitations      |
| ----------------- | ----------------------- | --------------- | ------------------ | ---------------- | ---------------- | ---------------------- |
| Button            | `FxButton`              | Actions         | focus-visible      | typecheck + cert | tones            | —                      |
| Status badge      | `FxStatusBadge`         | Status chrome   | text+color         | cert             | tones            | color-mix              |
| Priority badge    | `FxPriorityBadge`       | Priority        | text               | cert             | —                | —                      |
| Card              | `FxCard`                | Container       | heading            | cert             | actions slot     | —                      |
| Metric card       | `FxMetricCard`          | KPI             | label/value        | cert             | —                | —                      |
| Alert             | `FxAlert`               | Inline feedback | role semantics     | cert             | tones            | —                      |
| Text field        | `FxTextField`           | Input           | label/error alert  | cert             | —                | —                      |
| Table             | `FxTable`               | Simple table    | caption/th         | cert             | —                | No virtualization      |
| Dialog            | `FxDialog`              | Modal           | trap/Escape        | cert             | actions          | title id uniqueness    |
| Empty state       | `FxEmptyState`          | Empty           | heading            | cert             | action           | —                      |
| Skeleton          | `FxSkeleton`            | Loading         | aria-hidden        | cert             | —                | —                      |
| Loading region    | `FxLoadingRegion`       | Busy region     | aria-busy          | cert             | —                | —                      |
| Env banner        | `FxEnvBanner`           | Environment     | —                  | cert             | —                | —                      |
| Offline indicator | `FxOfflineIndicator`    | Connection      | text               | cert             | —                | Demo statuses          |
| Panel             | `FxPanel`               | Section         | title              | cert             | —                | —                      |
| Line chart        | `FxLineChart`           | Trend           | aria-label + table | cert             | data             | Synthetic SVG          |
| Bar chart         | `FxBarChart`            | Compare         | aria-label         | cert             | data             | —                      |
| Area chart        | `FxAreaChart`           | Volume          | aria-label         | cert             | data             | —                      |
| Pie chart         | `FxPieChart`            | Distribution    | legend             | cert             | data             | Color-only slices      |
| Donut chart       | `FxDonutChart`          | Distribution    | legend             | cert             | data             | Color-only             |
| KPI trend         | `FxKpiTrendCard`        | KPI+spark       | badge              | cert             | series           | —                      |
| Map panel         | `FxMapPanel`            | Schematic map   | labels/layers      | cert             | markers          | Not GIS; draw disabled |
| Weather current   | `FxWeatherCurrentCard`  | Conditions      | text               | cert             | props            | Synthetic              |
| Weather forecast  | `FxWeatherForecastCard` | Forecast table  | table              | cert             | days             | Synthetic              |
| Weather alert     | `FxWeatherAlertBanner`  | Advisory        | status             | cert             | —                | Synthetic              |

### Layouts (`@forge/fx-layouts` 1.0.0-rc.1) — Stability RC

| Component        | Export              | Purpose                | A11y      | Limitations                      | Products           |
| ---------------- | ------------------- | ---------------------- | --------- | -------------------------------- | ------------------ |
| App shell        | `FxAppShell`        | Product chrome         | landmarks | Mobile nav disclosure Needs Work | Reference; RMS S2B |
| Responsive grid  | `FxResponsiveGrid`  | Dashboard grid         | —         | —                                | Reference          |
| Grid item        | `FxGridItem`        | Span control           | —         | spans 3/4/6/8/12                 | Reference          |
| Breadcrumb       | `FxBreadcrumb`      | Hierarchy              | nav label | —                                | Reference          |
| Workspace layout | `FxWorkspaceLayout` | Record tabs            | tablist   | —                                | Reference; RMS S2D |
| Dashboard layout | `FxDashboardLayout` | Dashboard title region | h1        | —                                | Reference          |

### Hooks (`@forge/fx-hooks` 1.0.0-rc.1) — Stability RC

| Export          | Purpose              | Limitations                 | Products  |
| --------------- | -------------------- | --------------------------- | --------- |
| `useTheme`      | Theme state          | No persistence built-in     | Reference |
| `useResponsive` | Breakpoint helpers   | SSR-safe default desktop    | Reference |
| `useSelection`  | Multi-select set     | —                           | Reference |
| `useDialogs`    | Dialog id open state | —                           | Reference |
| `useOffline`    | Demo offline         | Not production connectivity | Reference |
| `useWorkspace`  | Tab state            | —                           | Reference |

### Patterns (`@forge/fx-patterns` 1.0.0-rc.1) — Stability Experimental/RC

| Export                | Purpose             | Stability    | Limitations    | Products  |
| --------------------- | ------------------- | ------------ | -------------- | --------- |
| `CreateRecordPattern` | Create flow demo    | Experimental | Reference demo | Reference |
| `DeleteRecordPattern` | Delete confirm demo | Experimental | Reference demo | Reference |
| `PatternFrame`        | Demo frame          | Experimental | —              | Reference |

## Not yet in registry (blocked / future)

| Name                      | Status         | Notes                                                            |
| ------------------------- | -------------- | ---------------------------------------------------------------- |
| Command palette           | Blocked        | Spec only                                                        |
| Package-level FX combobox | Needed for RMS | RMS `FxCombobox` is presentation shell; promote after governance |
| Notification center       | Planned        | Honest capability gating                                         |
| Global search shell       | Planned        | Phased search plan                                               |

## Temporary compatibility (RMS S2B–S2E)

| Component                     | Package / path                      | Stability                                        | Retirement condition                    | Products                        | Last reviewed |
| ----------------------------- | ----------------------------------- | ------------------------------------------------ | --------------------------------------- | ------------------------------- | ------------- |
| RmsShellBoundary              | `apps/rms-web/src/fx/shell`         | Temporary Compatibility                          | N/A (selector)                          | RMS                             | 2026-07-30    |
| RmsFxShell                    | `apps/rms-web/src/fx/shell`         | Temporary Compatibility → promote patterns to FX | After shared shell parity               | RMS                             | 2026-07-30    |
| RmsLegacyShellAdapter         | `apps/rms-web/src/fx/shell`         | Legacy Pending Retirement                        | FX shell GA + rollback window           | RMS                             | 2026-07-30    |
| LegacyNavigationBridge        | `apps/rms-web/src/fx/compatibility` | Temporary Compatibility                          | After FX nav primitives absorb grouping | RMS                             | 2026-07-30    |
| LegacyEnvironmentBannerBridge | `apps/rms-web/src/fx/compatibility` | Temporary Compatibility                          | Legacy path only                        | RMS                             | 2026-07-30    |
| FeatureGateChromeBridge       | `apps/rms-web/src/fx/compatibility` | Temporary Compatibility                          | Optional; FeatureGate remains source    | RMS                             | 2026-07-30    |
| RMS FxForm / field library    | `apps/rms-web/src/fx/forms`         | Experimental → promote to `@forge/fx-ui`         | After pilot + governance                | RMS; Academy/Industrial planned | 2026-07-30    |
| RMS FxTable framework         | `apps/rms-web/src/fx/tables`        | Experimental → promote to `@forge/fx-ui`         | After pilot + governance                | RMS; Academy/Industrial planned | 2026-07-30    |

### S2E promotion candidates (evaluate for `@forge/fx-ui`)

| Component name                      | Package (current)            | Purpose                            | Stability    | Products expected          | A11y                     | Tests                 | Docs                               |
| ----------------------------------- | ---------------------------- | ---------------------------------- | ------------ | -------------------------- | ------------------------ | --------------------- | ---------------------------------- |
| FxForm / FxFormSection / FxFormGrid | `apps/rms-web/src/fx/forms`  | Form layout chrome                 | Experimental | RMS; future Forge products | Labels/sections          | registry unit         | `products/rms/53-field-library.md` |
| FxField + typed fields              | `apps/rms-web/src/fx/forms`  | Field chrome (error/help/required) | Experimental | All Forge products         | aria-invalid/describedby | typecheck             | `53`                               |
| FxValidationSummary                 | `apps/rms-web/src/fx/forms`  | Form-level errors                  | Experimental | All                        | role=alert               | typecheck             | `57`                               |
| FxTable + toolbar/columns           | `apps/rms-web/src/fx/tables` | Data table presentation            | Experimental | All                        | caption/aria-sort        | registry + prefs unit | `54`–`56`                          |
| FxVirtualTable                      | `apps/rms-web/src/fx/tables` | Windowed rows                      | Experimental | Large lists                | status live              | typecheck             | `60`                               |

## Change log

| Date       | Change                                                 |
| ---------- | ------------------------------------------------------ |
| 2026-07-30 | Initial registry from RC1 + FX-S2A                     |
| 2026-07-30 | RMS S2B temporary shell/nav adapters                   |
| 2026-07-30 | RMS S2E forms/tables frameworks (promotion candidates) |
