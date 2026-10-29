# 18 — Feature Flag Matrix Final (S2F-8)

**Date:** 2026-07-31  
**Production default:** all FX flags **OFF** (legacy presentation)

## Foundations

| Flag                        | Seed default | Wired | Notes                                  |
| --------------------------- | ------------ | ----- | -------------------------------------- |
| `fx.rms.shell.enabled`      | false        | Yes   | Presentation only                      |
| `fx.rms.navigation.enabled` | false        | Yes   | Requires shell; invalid combo → legacy |
| `fx.rms.dashboard.enabled`  | false        | Yes   | Independent                            |
| `fx.rms.workspace.enabled`  | false        | Yes   | Independent                            |
| `fx.rms.forms.enabled`      | false        | Yes   | Independent                            |
| `fx.rms.tables.enabled`     | false        | Yes   | Independent                            |

## Modules

| Flag                                       | Seed default | Wired | Requires for FX                          |
| ------------------------------------------ | ------------ | ----- | ---------------------------------------- |
| `fx.rms.module.incidents.enabled`          | false        | S2F-1 | tables / forms / workspace (per surface) |
| `fx.rms.module.incidentReview.enabled`     | false        | S2F-2 | tables / forms                           |
| `fx.rms.module.cadMessages.enabled`        | false        | S2F-3 | tables                                   |
| `fx.rms.module.cadConnections.enabled`     | false        | S2F-4 | forms / tables                           |
| `fx.rms.module.cadConflicts.enabled`       | false        | S2F-5 | tables                                   |
| `fx.rms.module.nerisConfiguration.enabled` | false        | S2F-6 | forms                                    |
| `fx.rms.module.administration.enabled`     | false        | S2F-7 | tables                                   |
| `fx.rms.module.utilities.enabled`          | false        | S2F-7 | none (health chrome)                     |

## Resolution rules (certified by unit tests)

1. Defaults OFF when API flag undefined.
2. Platform-admin wildcard does **not** force FX on.
3. Module OFF → legacy even if foundations ON.
4. Module ON + foundation OFF → legacy compat for that surface.
5. Modules never enable foundations.
6. Module flags are independent of each other.
7. Shell/nav invalid combo fails safe to legacy.

## Env overrides (non-production)

```bash
NEXT_PUBLIC_FX_RMS_SHELL_ENABLED
NEXT_PUBLIC_FX_RMS_NAVIGATION_ENABLED
NEXT_PUBLIC_FX_RMS_WORKSPACE_ENABLED
NEXT_PUBLIC_FX_RMS_FORMS_ENABLED
NEXT_PUBLIC_FX_RMS_TABLES_ENABLED
NEXT_PUBLIC_FX_RMS_MODULE_INCIDENTS_ENABLED
NEXT_PUBLIC_FX_RMS_MODULE_INCIDENT_REVIEW_ENABLED
NEXT_PUBLIC_FX_RMS_MODULE_CAD_MESSAGES_ENABLED
NEXT_PUBLIC_FX_RMS_MODULE_CAD_CONNECTIONS_ENABLED
NEXT_PUBLIC_FX_RMS_MODULE_CAD_CONFLICTS_ENABLED
NEXT_PUBLIC_FX_RMS_MODULE_NERIS_CONFIGURATION_ENABLED
NEXT_PUBLIC_FX_RMS_MODULE_ADMINISTRATION_ENABLED
NEXT_PUBLIC_FX_RMS_MODULE_UTILITIES_ENABLED
```

Session overrides: `sessionStorage` key = flag name, value `1`/`true`.
