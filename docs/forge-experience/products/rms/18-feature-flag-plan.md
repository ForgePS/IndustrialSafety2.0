# Feature Flag Plan — FX RMS (S2B update)

**Document:** `18-feature-flag-plan.md`  
**Status:** IMPLEMENTED (seeded default false)

## FX presentation flags

| Flag                                       | Default | Seeded | Notes                                        |
| ------------------------------------------ | ------- | ------ | -------------------------------------------- |
| `fx.rms.shell.enabled`                     | false   | Yes    | Presentation only                            |
| `fx.rms.navigation.enabled`                | false   | Yes    | Requires shell                               |
| `fx.rms.dashboard.enabled`                 | false   | Yes    | Independent of shell/nav                     |
| `fx.rms.workspace.enabled`                 | false   | Yes    | Independent of shell/nav/dashboard           |
| `fx.rms.forms.enabled`                     | false   | Yes    | Independent of all prior FX flags            |
| `fx.rms.tables.enabled`                    | false   | Yes    | Independent of all prior FX flags            |
| `fx.rms.module.incidents.enabled`          | false   | Yes    | S2F-1; requires foundations for FX surfaces  |
| `fx.rms.module.incidentReview.enabled`     | false   | Yes    | S2F-2; requires tables/forms for FX surfaces |
| `fx.rms.module.cadMessages.enabled`        | false   | Yes    | S2F-3; requires tables for FX list           |
| `fx.rms.module.cadConnections.enabled`     | false   | Yes    | S2F-4; requires forms/tables for FX surfaces |
| `fx.rms.module.cadConflicts.enabled`       | false   | Yes    | S2F-5; requires tables for FX list           |
| `fx.rms.module.nerisConfiguration.enabled` | false   | Yes    | S2F-6; requires forms for FX surfaces        |
| `fx.rms.module.administration.enabled`     | false   | Yes    | S2F-7; requires tables for select-tenant FX  |
| `fx.rms.module.utilities.enabled`          | false   | Yes    | S2F-7; health FX with module alone           |

## Evaluation rules (client)

Implemented in `resolveRmsFxPresentationFlags`:

- Default off
- Platform-admin wildcard **does not** force FX on
- Env: `NEXT_PUBLIC_FX_RMS_SHELL_ENABLED` / `NEXT_PUBLIC_FX_RMS_NAVIGATION_ENABLED`
- Session: `sessionStorage` key = flag name, value `1`/`true`
- Invalid nav-without-shell → legacy

## Combinations

| Shell | Nav   | Result                     |
| ----- | ----- | -------------------------- |
| false | false | Legacy                     |
| true  | false | FX shell + registry groups |
| true  | true  | FX shell + secondary nav   |
| false | true  | Legacy (invalid)           |
