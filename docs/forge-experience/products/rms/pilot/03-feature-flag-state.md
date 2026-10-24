# 03 — Feature Flag State

**Phase:** FX-P1  
**As of:** 2026-07-31  
**Global defaults:** all `fx.rms.*` = **false** (seed)  
**Pilot tenant overrides:** **none** (tenant not designated)

| Flag                                       | Global default | Pilot override | Wave         |
| ------------------------------------------ | -------------- | -------------- | ------------ |
| `fx.rms.shell.enabled`                     | false          | —              | 1            |
| `fx.rms.navigation.enabled`                | false          | —              | 1            |
| `fx.rms.dashboard.enabled`                 | false          | —              | Optional     |
| `fx.rms.workspace.enabled`                 | false          | —              | 1            |
| `fx.rms.forms.enabled`                     | false          | —              | 1            |
| `fx.rms.tables.enabled`                    | false          | —              | 1            |
| `fx.rms.module.incidents.enabled`          | false          | —              | 1            |
| `fx.rms.module.incidentReview.enabled`     | false          | —              | 2            |
| `fx.rms.module.cadMessages.enabled`        | false          | —              | 3            |
| `fx.rms.module.cadConflicts.enabled`       | false          | —              | 4            |
| `fx.rms.module.nerisConfiguration.enabled` | false          | —              | 5            |
| `fx.rms.module.administration.enabled`     | false          | —              | 6            |
| `fx.rms.module.utilities.enabled`          | false          | —              | 7            |
| `fx.rms.module.cadConnections.enabled`     | false          | —              | 8 (deferred) |

## Verification commands

Effective flags for pilot tenant:

```http
GET /api/v1/tenants/{pilotTenantId}/features/effective
```

Confirm non-pilot tenants do **not** receive FX module keys as true from defaults.

## Change log

| Timestamp  | Actor       | Change               | Reason                      |
| ---------- | ----------- | -------------------- | --------------------------- |
| 2026-07-31 | FX-P1 setup | No overrides applied | Awaiting tenant designation |
