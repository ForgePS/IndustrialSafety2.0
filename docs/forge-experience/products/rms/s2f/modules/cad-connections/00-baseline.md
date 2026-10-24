# S2F-4 CAD Connections — Baseline

**Module:** CAD Connections  
**Date:** 2026-07-31  
**Source:** Verified `apps/rms-web` (not planning docs alone)

## Live route migrated

| Route               | Entry                          | Gate         | APIs                                                                                                            |
| ------------------- | ------------------------------ | ------------ | --------------------------------------------------------------------------------------------------------------- |
| `/cad/connections/` | `app/cad/connections/page.tsx` | `cadEnabled` | `listCadConnections`, `createCadConnection`, `enableCadConnection`, `disableCadConnection`, `testCadConnection` |

## Verified create behavior

| Concern       | Live behavior                                                                                                                                                                      |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Form field    | Name only (default `"Synthetic CAD"`)                                                                                                                                              |
| Fixed payload | `vendor: Forge`, `adapterKey: forge.synthetic`, `adapterVersion: 1.0.0`, `environment: DEVELOPMENT`, `transportType: HTTPS_WEBHOOK`, `intakeMode: HYBRID`, `configurationJson: {}` |
| Success copy  | `"Connection created as DRAFT."`                                                                                                                                                   |

## Verified list columns

| Column    | Field                             |
| --------- | --------------------------------- |
| Name      | `name`                            |
| Public ID | `publicId` (mono)                 |
| Status    | `status` (exact API string)       |
| Health    | `healthStatus` (exact API string) |
| Actions   | Test / Enable / Disable           |

## Verified row actions

| Action  | API                                                                   |
| ------- | --------------------------------------------------------------------- |
| Test    | `POST …/cad/connections/{id}/test` → message `Test result: ${status}` |
| Enable  | `POST …/cad/connections/{id}/enable`                                  |
| Disable | `POST …/cad/connections/{id}/disable`                                 |

## Explicitly NOT present in live UI

| Capability                              | Status                                                               |
| --------------------------------------- | -------------------------------------------------------------------- |
| Edit connection form                    | Absent                                                               |
| Archive / delete controls               | Absent                                                               |
| Credential / webhook secret display     | Explicitly excluded in copy; secrets never shown                     |
| PRODUCTION environment create           | Copy states PRODUCTION stays disabled; create hard-codes DEVELOPMENT |
| Search / filters / sort / pagination    | Absent (full list load)                                              |
| Detail drawer / `/cad/connections/{id}` | Absent                                                               |

## Related but out of S2F-4 scope

| Route                              | Why deferred                |
| ---------------------------------- | --------------------------- |
| `/cad/messages/`                   | S2F-3 (separate module)     |
| `/cad/conflicts/`                  | S2F-5                       |
| `/cad/operations/`                 | Separate operations summary |
| `/cad/unmapped/`, `/cad/mappings/` | Not this module             |

## Secret / credential posture

UI never renders secret values. API type exposes `hasCredentialsSecret` / `hasWebhookSecret` booleans only; page does not display those fields either. No change to secrets storage or credential handling.
