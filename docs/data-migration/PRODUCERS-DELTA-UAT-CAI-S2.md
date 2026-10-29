# PRODUCERS — Delta UAT (CAI-S2)

**Date (UTC):** 2026-08-14  
**Tenant:** `019ff7d0-c20f-7659-81e4-c0cd68e23262`  
**Admin context:** `PLATFORM_ADMIN_SUPPORT`

## Module results

| Module             | Result | Evidence                                           |
| ------------------ | ------ | -------------------------------------------------- |
| DASHBOARD          | PASS   | Sites/personnel/LOTO APIs healthy; counts non-zero |
| PERSONNEL          | PASS   | API list 1058                                      |
| TRAINING           | PASS   | DB 17                                              |
| CERTIFICATIONS     | PASS   | DB template present                                |
| INCIDENTS          | PASS   | DB 12                                              |
| INSPECTIONS        | PASS   | DB 6                                               |
| OBSERVATIONS       | PASS   | empty (0 source)                                   |
| JSA                | PASS   | empty (0 source)                                   |
| FORMS              | PASS   | DB 48/34                                           |
| LOTO               | PASS   | API procedures 2539; records 59                    |
| DOT                | PASS   | DB 48                                              |
| CORRECTIVE ACTIONS | PASS   | Producers 12                                       |
| QR SCAN            | PASS   | 2524/2524; +5 scan events applied                  |
| EHS TEMPLATES      | PASS   | 34 global                                          |
| DOCUMENTS          | PASS   | attachments HEAD OK; promoted keys                 |
| WORKERS COMP       | PASS   | 27 cases / 16 medical (RLS gated)                  |
| Fleet drivers/MVR  | PASS   | 201; vehicles 0                                    |

## Mapping sample

LOTO procedure + QR link updates from Producers delta candidates resolved via id-map; history/scan inserts present under live tenant.

| Gate                         | Result |
| ---------------------------- | ------ |
| DELTA_MAPPING_SAMPLE         | PASS   |
| MODULE_UAT                   | PASS   |
| COUNT_SANITY                 | PASS   |
| IMPORT_DUPLICATE_SANITY      | PASS   |
| BROKEN_REFERENCE_COUNT       | 0      |
| ACTIVE_QR_LINKS_BROKEN       | 0      |
| BROKEN_ATTACHMENT_REFERENCES | 0      |
