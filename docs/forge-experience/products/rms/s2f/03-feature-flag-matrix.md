# 03 — Feature Flag Matrix

## Foundation (existing)

| Flag                        | Default |
| --------------------------- | ------- |
| `fx.rms.shell.enabled`      | false   |
| `fx.rms.navigation.enabled` | false   |
| `fx.rms.dashboard.enabled`  | false   |
| `fx.rms.workspace.enabled`  | false   |
| `fx.rms.forms.enabled`      | false   |
| `fx.rms.tables.enabled`     | false   |

## Module (S2F)

| Flag                                       | Default | Wired     |
| ------------------------------------------ | ------- | --------- |
| `fx.rms.module.incidents.enabled`          | false   | **S2F-1** |
| `fx.rms.module.incidentReview.enabled`     | false   | **S2F-2** |
| `fx.rms.module.cadMessages.enabled`        | false   | **S2F-3** |
| `fx.rms.module.cadConnections.enabled`     | false   | **S2F-4** |
| `fx.rms.module.cadConflicts.enabled`       | false   | **S2F-5** |
| `fx.rms.module.nerisConfiguration.enabled` | false   | **S2F-6** |
| `fx.rms.module.administration.enabled`     | false   | **S2F-7** |
| `fx.rms.module.utilities.enabled`          | false   | **S2F-7** |

## Incidents composition

| Surface   | FX when                      |
| --------- | ---------------------------- |
| List      | module.incidents + tables    |
| New       | module.incidents + forms     |
| Workspace | module.incidents + workspace |

Env override for incidents module: `NEXT_PUBLIC_FX_RMS_MODULE_INCIDENTS_ENABLED=true`

## Incident Review composition

| Surface              | FX when                        |
| -------------------- | ------------------------------ |
| Queue `/review/`     | module.incidentReview + tables |
| Officer review forms | module.incidentReview + forms  |

Env: `NEXT_PUBLIC_FX_RMS_MODULE_INCIDENT_REVIEW_ENABLED=true`

## CAD Messages composition

| Surface               | FX when                     |
| --------------------- | --------------------------- |
| `/cad/messages/` list | module.cadMessages + tables |

Env: `NEXT_PUBLIC_FX_RMS_MODULE_CAD_MESSAGES_ENABLED=true`

## CAD Connections composition

| Surface          | FX when                        |
| ---------------- | ------------------------------ |
| Create form      | module.cadConnections + forms  |
| Connections list | module.cadConnections + tables |

Env: `NEXT_PUBLIC_FX_RMS_MODULE_CAD_CONNECTIONS_ENABLED=true`

## CAD Conflicts composition

| Surface                     | FX when                      |
| --------------------------- | ---------------------------- |
| `/cad/conflicts/` OPEN list | module.cadConflicts + tables |

Env: `NEXT_PUBLIC_FX_RMS_MODULE_CAD_CONFLICTS_ENABLED=true`

## NERIS Configuration composition

| Surface                 | FX when                           |
| ----------------------- | --------------------------------- |
| `/configuration/` forms | module.nerisConfiguration + forms |

Env: `NEXT_PUBLIC_FX_RMS_MODULE_NERIS_CONFIGURATION_ENABLED=true`

## Administration & Utilities composition

| Surface           | FX when                                   |
| ----------------- | ----------------------------------------- |
| `/select-tenant/` | module.administration + tables            |
| `/health/`        | module.utilities (no foundation required) |

Env:

```bash
NEXT_PUBLIC_FX_RMS_MODULE_ADMINISTRATION_ENABLED=true
NEXT_PUBLIC_FX_RMS_TABLES_ENABLED=true
NEXT_PUBLIC_FX_RMS_MODULE_UTILITIES_ENABLED=true
```
