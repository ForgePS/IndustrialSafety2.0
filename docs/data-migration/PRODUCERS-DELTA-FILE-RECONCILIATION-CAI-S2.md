# PRODUCERS — Delta file reconciliation (CAI-S2)

| Metric                                      | Value |
| ------------------------------------------- | ----: |
| Baseline storage objects (DM-S1)            |  9303 |
| Current storage objects (CAI-S2 capture)    |  9305 |
| DELTA_FILES_NEW (source)                    |     2 |
| DELTA_FILES_UPDATED                         |     0 |
| DELTA_FILES_DELETED                         |     0 |
| DELTA_FILES_REUSED (already in docs bucket) |     2 |
| DELTA_FILES_FAILED                          | **0** |
| BROKEN_ATTACHMENT_REFERENCES                | **0** |
| PERMANENT_SIGNED_URLS                       | **0** |

New objects are LOTO procedure attachments under Producers `module-attachments/...`. Canonical keys use `tenants/{liveTenantId}/…` with business-id substitution. Existing 13 DB attachment rows remain on promoted keys after apply.
