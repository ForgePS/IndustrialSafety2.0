# DM-S0 Cutover Risks

**Source:** `forge-industrial-safety`  
**Sprint:** Inventory only — no freeze/export/import executed

## Critical / High

| ID  | Sev    | Finding                                                                                                                | Cutover impact                                                                      |
| --- | ------ | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| R1  | HIGH   | Active Cloud Functions can still write customer data (imports, document uploads, claim sync, emails, scan completions) | Requires coordinated write-freeze before final delta                                |
| R2  | HIGH   | Ambiguous tenant keys (`Producers Rice Mill`, `GLOBAL`)                                                                | Bad tenant assignment if loaded naively                                             |
| R3  | HIGH   | Industrial target DDL not in monorepo tip migrations through `0038`                                                    | Cannot safely load industrial domains to production until schema package confirmed  |
| R4  | HIGH   | Storage ~15.4 GiB / 9.3k objects                                                                                       | Long-running copy; needs integrity checksums and resume                             |
| R5  | MEDIUM | Auth users (10) vs personnel (1097)                                                                                    | Most employees are not interactive Auth users; avoid over-creating Cognito accounts |
| R6  | MEDIUM | Dual scoping (`businessId` vs `organizationId`-only sites/departments)                                                 | Join errors → orphan facilities                                                     |
| R7  | MEDIUM | Large audit streams (`activityLogs` 18k+, QR audit 6k+)                                                                | Delta noise; may need archive strategy                                              |
| R8  | MEDIUM | `companyVehicleDrivers` significant schema drift                                                                       | Transform fragility                                                                 |
| R9  | LOW    | Nested subcollections rare in samples (`equipmentMigrationBatches/rows` only)                                          | Residual risk of missed nests                                                       |
| R10 | LOW    | Delta-unsafe collections lack updatedAt                                                                                | Need full re-extract under freeze                                                   |
| R11 | INFO   | SES/email still sandbox on AWS side (separate program)                                                                 | Invitation/recovery email after cutover                                             |
| R12 | INFO   | Export buckets already exist                                                                                           | Low risk to run later authorized export                                             |

## Delta readiness

- **DELTA_SAFE:** majority of operational collections (updatedAt-like fields present)
- **DELTA_UNSAFE:** `content_overrides`, `documentAccessEvents`, `personnelRosterImportSettings`, `platformBillingNotifications`, `qr_link_scan_events`
- Final cutover still needs freeze because Functions/integrations continue to write

## External / integration writers (do not modify in DM-S0)

| Integration / surface                      | Writes to                                 | Consideration                   |
| ------------------------------------------ | ----------------------------------------- | ------------------------------- |
| Mobile / web industrial app                | Firestore + Storage                       | Primary live writer             |
| Cloud Functions (imports, PDF, QR, claims) | Firestore / Storage / Auth claims / email | Freeze list                     |
| Equipment migration batches                | Firestore + Storage                       | Disable before final extract    |
| Training import jobs                       | Firestore + Storage                       |                                 |
| Billing/notification email functions       | Outbox + external email                   |                                 |
| Prior AWS ind-11 rehearsal loads           | Aurora development only                   | Not production customer cutover |

## Orphan references

Full referential integrity scans were **not** executed in DM-S0 (cost/control).  
DM-S1 must run explicit orphan reports for:

- `siteId` / facility references
- personnel references on incidents/training/LOTO
- Storage paths missing objects
- Auth UIDs missing membership docs

## Recommended freeze order (future sprint)

1. Disable/pause import & migration functions
2. Quiesce interactive admin imports
3. Firestore export to verified bucket
4. Auth metadata package
5. Storage metadata + copy
6. AWS transform/load
7. Only then DNS/customer traffic (PROD-S2 — not authorized now)
