# S2F-3 CAD Messages — Migration Plan

## Composition

| Surface               | FX when                         | Compatibility         |
| --------------------- | ------------------------------- | --------------------- |
| Message metadata list | `module.cadMessages` ∧ `tables` | Legacy `styles.table` |

## Foundations used

- Required: `fx.rms.tables.enabled`
- Optional ambient: shell / navigation (not forced)
- Forms / workspace: **not required** for verified route

## Rules

- Module off → legacy (even if tables on)
- Module on + tables off → legacy compat
- Never force foundation flags on
- No partial FX/legacy table chrome in one view
