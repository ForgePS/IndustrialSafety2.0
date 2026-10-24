# S2F-4 CAD Connections — Migration Plan

## Composition

| Surface                        | FX when                            | Compatibility         |
| ------------------------------ | ---------------------------------- | --------------------- |
| Create synthetic webhook form  | `module.cadConnections` ∧ `forms`  | Legacy HTML form      |
| Connections list + row actions | `module.cadConnections` ∧ `tables` | Legacy `styles.table` |

## Foundations used

- Required for FX create: `fx.rms.forms.enabled`
- Required for FX list: `fx.rms.tables.enabled`
- Optional ambient: shell / navigation (not forced)
- Workspace: **not required**

## Rules

- Module off → legacy form + legacy table (even if forms/tables on)
- Module on + foundation off → legacy compat for that surface
- Never force foundation flags on
- Independent of `cadMessages` / other module flags
- Same create payload, same action endpoints, same status/health strings
