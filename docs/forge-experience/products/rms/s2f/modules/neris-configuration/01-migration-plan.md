# S2F-6 NERIS Configuration — Migration Plan

## Composition

| Surface             | FX when                               | Compatibility    |
| ------------------- | ------------------------------------- | ---------------- |
| Operating mode form | `module.nerisConfiguration` ∧ `forms` | Legacy HTML form |
| Field overlay form  | `module.nerisConfiguration` ∧ `forms` | Legacy HTML form |

## Foundations used

- Required for FX: `fx.rms.forms.enabled`
- Shell / navigation: ambient only (not required; never forced)
- Tables / workspace: **not required**

## Rules

- Module off → legacy (even if forms on)
- Module on + forms off → legacy compat
- Never force foundation flags on
- Same GET/PUT endpoints and payloads
