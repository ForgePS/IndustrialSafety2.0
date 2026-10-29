# 04 — Production Validation

**Phase:** FX-P1  
**Status:** **NOT STARTED** — blocked on pilot tenant designation

## Wave 0 (pre-enablement)

| Check                                    | Expected     | Result                                        |
| ---------------------------------------- | ------------ | --------------------------------------------- |
| Auth login (Cognito)                     | Works        | Pending                                       |
| Tenant switch `/select-tenant/`          | Legacy table | Pending                                       |
| Home / incidents / review / CAD / config | Legacy       | Pending                                       |
| Global FX defaults                       | All false    | Code/seed certified; live env confirm pending |

## Per-wave validation checklist (execute after each enable)

| Check            | Pass criteria                      |
| ---------------- | ---------------------------------- |
| Authentication   | Session intact after flag change   |
| Tenant switching | `chooseTenant` still works         |
| Navigation       | Expected items; no dead links      |
| Routing          | Direct URL / refresh / bookmarks   |
| Forms            | Labels, save, validation, errors   |
| Tables           | Columns, actions, empty/loading    |
| Dialogs          | If present — confirm/cancel        |
| Save operations  | Same API success/failure as legacy |
| Feature gates    | Product gates still authoritative  |
| Non-pilot tenant | Remains legacy                     |

## Parity

For each enabled surface, compare FX vs legacy (second browser / flag off account) for workflow completion — not visual identity.

## Results log

| Wave | Date | Tester | Outcome     | Notes |
| ---- | ---- | ------ | ----------- | ----- |
| —    | —    | —      | Not started | —     |
