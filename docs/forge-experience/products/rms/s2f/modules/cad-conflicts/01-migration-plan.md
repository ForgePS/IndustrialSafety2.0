# S2F-5 CAD Conflicts — Migration Plan

## Composition

| Surface                               | FX when                          | Compatibility         |
| ------------------------------------- | -------------------------------- | --------------------- |
| Open conflicts list + resolve actions | `module.cadConflicts` ∧ `tables` | Legacy `styles.table` |

## Foundations used

- Required for FX list: `fx.rms.tables.enabled`
- Forms / workspace: **not required** for verified route
- Optional ambient: shell / navigation (not forced)

## Rules

- Module off → legacy (even if tables on)
- Module on + tables off → legacy compat
- Never force foundation flags on
- Independent of other CAD module flags
- Same OPEN query, same resolve payloads, same incident links
