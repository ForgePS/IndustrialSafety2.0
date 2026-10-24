# S2F-3 CAD Messages — Baseline

**Module:** CAD Messages & Activity  
**Date:** 2026-07-31  
**Source:** Verified `apps/rms-web` (not planning docs alone)

## Live route migrated

| Route            | Entry                       | Gate                                           | API                                                |
| ---------------- | --------------------------- | ---------------------------------------------- | -------------------------------------------------- |
| `/cad/messages/` | `app/cad/messages/page.tsx` | `cadOperations` (`rms.cad.operations.enabled`) | `listCadMessages(tenantId)` → `GET …/cad/messages` |

## Verified columns (metadata only)

| Column          | Field                                                |
| --------------- | ---------------------------------------------------- |
| Received        | `receivedAt`                                         |
| Status          | `processingStatus` (exact API string)                |
| Auth            | `authenticationStatus` (exact API string)            |
| Source message  | `sourceMessageId`                                    |
| Source incident | `sourceIncidentId` (text id, not incident deep-link) |
| Size            | `payloadSizeBytes`                                   |

## Explicitly NOT present in live UI

| Capability                              | Status                      |
| --------------------------------------- | --------------------------- |
| Message detail / drawer                 | Absent                      |
| Raw payload display                     | Explicitly excluded in copy |
| Search / filters / sort UI / pagination | Absent (full list load)     |
| Retry / reprocess controls              | Absent                      |
| Export                                  | Absent                      |
| Row actions / incident hyperlinks       | Absent                      |
| Dedicated CAD activity feed             | Absent                      |
| `/cad/messages/{id}`                    | Absent                      |

## Related but out of S2F-3 scope

| Route                              | Why deferred                                                 |
| ---------------------------------- | ------------------------------------------------------------ |
| `/cad/operations/`                 | Operations summary (separate page); not `cadMessages` module |
| `/cad/connections/`                | S2F-4                                                        |
| `/cad/conflicts/`                  | S2F-5                                                        |
| `/cad/unmapped/`, `/cad/mappings/` | Not this module                                              |

## Planning vs live discrepancy

Authorization titled “Messages & Activity.” Live app has **message metadata list only**. No activity feed to migrate. Documented as deferred / N/A.
