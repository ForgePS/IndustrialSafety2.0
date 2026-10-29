# 02 — Module Dependency Map

| Module              | May use foundations when module + foundation flags on |
| ------------------- | ----------------------------------------------------- |
| Incidents           | workspace, forms, tables                              |
| Incident Review     | forms, tables                                         |
| CAD Messages        | tables                                                |
| CAD Connections     | forms, tables                                         |
| CAD Conflicts       | tables, dialogs                                       |
| NERIS Configuration | forms                                                 |
| Administration      | tables                                                |
| Utilities           | none required (health chrome only)                    |

## Rules

- Module flag **never** forces a foundation flag on.
- Module off → legacy for that module (even if foundations on).
- Module on + foundation off → compatibility legacy surface (documented).
- No partially initialized FX surfaces.
