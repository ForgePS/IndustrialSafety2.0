# DM-S1 Write-Freeze Plan

**Sprint:** DM-S1  
**Status:** PLAN ONLY — **do not disable Cloud Functions in DM-S1**

Source inventory from DM-S0 (28 listed helpers/writers). Exact pause mechanics belong to cutover sprint.

## Writer inventory (cutover-relevant)

| FUNCTION                               | WRITES_TO                                               | TRIGGER                    | CAN_BE_PAUSED | CUTOVER_ACTION                                                                             | RESTART_ACTION                     | RISK                                       |
| -------------------------------------- | ------------------------------------------------------- | -------------------------- | ------------- | ------------------------------------------------------------------------------------------ | ---------------------------------- | ------------------------------------------ |
| Equipment migration / document writers | Firestore `equipmentMigrationBatches` (+ rows), Storage | HTTP / callable / Storage  | YES           | Pause import + migration functions; drain batches                                          | Redeploy / re-enable after AWS SoT | HIGH — mutates equipment docs              |
| Training import jobs                   | Firestore training + Storage                            | HTTP / job                 | YES           | Pause training import                                                                      | Re-enable                          | HIGH                                       |
| LOTO PDF parse                         | Firestore LOTO + Storage                                | Storage finalize           | YES           | Pause PDF parse CF                                                                         | Re-enable                          | MEDIUM                                     |
| Form PDF / sign helpers                | Firestore forms + Storage                               | callable / Storage         | YES           | Pause                                                                                      | Re-enable                          | MEDIUM                                     |
| QR / scan resolvers / completions      | Firestore `qr_*` / scan events                          | HTTPS / callable           | PARTIAL       | Pause writers; keep read resolvers if needed for customer traffic (PROD-S2 not authorized) | Re-enable                          | HIGH for scan streams                      |
| `syncBusinessClaimsOnMembershipWrite`  | Auth custom claims                                      | Firestore membership write | YES           | Pause after membership freeze                                                              | Re-enable                          | HIGH — Auth claim drift                    |
| `syncMyBusinessClaims`                 | Auth claims                                             | callable                   | YES           | Pause                                                                                      | Re-enable                          | HIGH                                       |
| Auth / password provisioning helpers   | Auth users                                              | Auth / admin               | YES           | Freeze admin provisioning                                                                  | Re-enable                          | HIGH                                       |
| Billing / notification email + outbox  | Firestore outbox + email                                | scheduled / write          | YES           | Pause outbound; drain outbox                                                               | Re-enable                          | MEDIUM                                     |
| Platform notification writers          | Firestore notifications                                 | write / schedule           | YES           | Pause                                                                                      | Re-enable                          | LOW–MED                                    |
| Interactive web/mobile industrial app  | Firestore + Storage                                     | user traffic               | PARTIAL       | Quiesce admin imports; full traffic cut is PROD-S2                                         | Restore                            | CRITICAL if left live during final extract |

## Recommended future freeze order (not executed now)

1. Pause import & migration Cloud Functions
2. Quiesce interactive admin import UIs
3. Pause claim-sync writers
4. Native Firestore export + logical extract under quiet window
5. Auth metadata package
6. Storage copy (later sprint)
7. AWS transform/load
8. DNS / customer traffic only when PROD-S2 authorized

## DELTA_UNSAFE collections (freeze / re-extract strategy)

| Collection                    | Later cutover strategy                                                 |
| ----------------------------- | ---------------------------------------------------------------------- |
| content_overrides             | FULL_REEXTRACT under freeze                                            |
| documentAccessEvents          | FULL_REEXTRACT or ARCHIVE_ONLY                                         |
| personnelRosterImportSettings | FULL_REEXTRACT                                                         |
| platformBillingNotifications  | FULL_REEXTRACT or EXCLUDE_WITH_APPROVAL                                |
| qr_link_scan_events           | WRITE_FREEZE + FULL_REEXTRACT (or ARCHIVE_ONLY if not migrating scans) |

DELTA_SAFE collections may use SOURCE_HASH_COMPARE / APPEND_ONLY after freeze validation — final cutover still requires freeze because Functions continue to write.
