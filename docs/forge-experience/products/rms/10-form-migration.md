# Form Migration Plan (FX-S2E)

**Document:** `10-form-migration.md`  
**Gate:** FX-S2E  
**Status:** IMPLEMENTED (default-off)

## Flag

`fx.rms.forms.enabled` — default **false**, independent of shell/nav/dashboard/workspace/tables.

## Migrated behind flag

| Form                  | Route               | Framework                               |
| --------------------- | ------------------- | --------------------------------------- |
| New manual incident   | `/incidents/new/`   | `FxForm` + `FxDateField` / `FxTextarea` |
| CAD connection create | `/cad/connections/` | `FxForm` + `FxTextField`                |

## Deferred (higher risk)

Incident section `FieldRenderer`, officer/specialty review action forms — preserve current markup until dedicated field-renderer chrome pass.

## Preserved

Payloads, `createIncident` / `createCadConnection` APIs, validation rules, URLs, drafts.
