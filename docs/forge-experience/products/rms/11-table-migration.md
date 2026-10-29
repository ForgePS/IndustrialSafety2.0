# Table Migration Plan (FX-S2E)

**Document:** `11-table-migration.md`  
**Gate:** FX-S2E  
**Status:** IMPLEMENTED (default-off)

## Flag

`fx.rms.tables.enabled` — default **false**, independent of other FX flags.

## Migrated behind flag

| Table           | Route               | Notes                                          |
| --------------- | ------------------- | ---------------------------------------------- |
| Incidents list  | `/incidents/`       | `ListControlsView` preserved; body → `FxTable` |
| Review queue    | `/review/`          | Same client status filter                      |
| CAD messages    | `/cad/messages/`    | Read-only metadata                             |
| CAD connections | `/cad/connections/` | Existing Test/Enable/Disable actions only      |

## Framework

`apps/rms-web/src/fx/tables/` — toolbar, columns (local prefs), sort/filter/search/pagination helpers, selection/bulk/export hooks, virtual windowing, error isolation.
