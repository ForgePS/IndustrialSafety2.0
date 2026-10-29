# S2F-6 NERIS Configuration — Baseline

**Module:** NERIS Configuration  
**Date:** 2026-07-31  
**Source:** Verified `apps/rms-web` (not planning docs alone)

## Live route migrated

| Route             | Entry                        | Gate                                                             | APIs                                                                                                 |
| ----------------- | ---------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `/configuration/` | `app/configuration/page.tsx` | `tenantConfiguration` (`rms.neris.tenant_configuration.enabled`) | `getTenantNerisConfiguration`, `putTenantNerisConfiguration`, `listFieldOverlays`, `putFieldOverlay` |

## Verified sections

### Operating mode

| Concern      | Live behavior                                                            |
| ------------ | ------------------------------------------------------------------------ |
| Display      | Current mode text: `config?.operatingMode ?? "MANUAL_ONLY"`              |
| Warning copy | Local validation / tenant defaults note; do not edit official code lists |
| Save button  | `"Save tenant configuration"`                                            |
| Save payload | `{ operatingMode: "MANUAL_ONLY", status: config?.status ?? "ACTIVE" }`   |
| Success      | `"Tenant configuration saved."`                                          |

### Field overlays

| Field           | Control                                                  | Payload property                |
| --------------- | -------------------------------------------------------- | ------------------------------- |
| Field           | `<select>` of overlays (+ selected id option if missing) | `fieldId`                       |
| Field ID (UUID) | Text input shown only when `selectedFieldId` is empty    | Sets `selectedFieldId`          |
| Display label   | Text                                                     | `displayLabel` (trim or null)   |
| Help text       | Textarea (3 rows)                                        | `helpText` (trim or null)       |
| Display order   | Number input                                             | `displayOrder` (Number or null) |
| Favorite        | Checkbox                                                 | `favorite`                      |
| Save            | `"Save field overlay"` (disabled without field id)       | PUT overlay                     |

Success: `"Field overlay saved. Official NERIS codes were not modified."`

Empty overlays: `"No field overlays yet. Save an overlay to customize a field."`

## Explicitly NOT present in live UI

| Capability                                                 | Status                                                              |
| ---------------------------------------------------------- | ------------------------------------------------------------------- |
| Organization / agency identifier editors                   | Absent                                                              |
| Export / transmission configuration                        | Absent                                                              |
| Official code mapping editor                               | Explicitly read-only (copy only)                                    |
| Incident / response / personnel / apparatus defaults forms | Absent                                                              |
| Validation-rule editor                                     | Absent (warning mentions local validation may be configured; no UI) |
| Cancel / reset actions                                     | Absent                                                              |
| Import / export settings                                   | Absent                                                              |
| Audit history                                              | Absent                                                              |
| Visibility / optionalVisible editor                        | Type has `optionalVisible`; not in UI                               |
| Safe defaults / localValidationJson editors                | Type fields only; not in UI                                         |

## Related but out of S2F-6 scope

| Area                                 | Why deferred              |
| ------------------------------------ | ------------------------- |
| Incident intake / review / specialty | Separate modules          |
| NERIS export engine / submission     | Explicitly not authorized |
| Administration / utilities           | S2F-7                     |
