# S2F-7 Administration & Utilities — Migration Plan

## Composition

| Surface             | Flag                    | FX when                            | Compatibility     |
| ------------------- | ----------------------- | ---------------------------------- | ----------------- |
| Select tenant table | `module.administration` | ∧ `tables`                         | Legacy HTML table |
| Platform health     | `module.utilities`      | module on (no foundation required) | Legacy panel      |

## Foundations

- Administration: `fx.rms.tables.enabled` for FX select-tenant
- Utilities: no forms/tables required for verified health surface
- Shell / navigation: ambient only; never forced
- Flags remain independent (admin off does not affect utilities and vice versa)

## Rules

- Each module off → that surface legacy
- Never force foundation flags on
- Same `chooseTenant` / `/health` fetch behavior
- Login remains legacy (auth out of scope)
