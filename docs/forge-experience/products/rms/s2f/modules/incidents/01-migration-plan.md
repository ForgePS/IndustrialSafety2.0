# S2F-1 Incidents — Migration Plan

## Approach

Strangler composition: module flag + foundation flags select FX vs legacy chrome. Domain panels, FieldRenderer, autosave, and APIs remain as-is.

## Surfaces

| Surface | FX composition                          | Compatibility             |
| ------- | --------------------------------------- | ------------------------- |
| List    | `FxTable` + existing `ListControlsView` | Legacy `styles.table`     |
| New     | `FxForm` + date/textarea                | Legacy form markup        |
| Detail  | `IncidentFxWorkspaceLayout`             | `IncidentWorkspaceLayout` |

## Out of scope

Lifecycle changes, FieldRenderer replacement, Review queue (`/review/` → S2F-2), CAD modules.
