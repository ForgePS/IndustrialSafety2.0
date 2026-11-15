# DM-S0 Firebase Inventory

**Source:** `forge-industrial-safety` (ONLY)  
**Method:** Admin SDK / GCS list metadata via `@forge/firebase-inventory`  
**Mode:** READ ONLY

## Firestore database

| Field            | Value              |
| ---------------- | ------------------ |
| Database         | `(default)`        |
| Location         | `nam5`             |
| Mode             | `FIRESTORE_NATIVE` |
| PITR             | enabled (observed) |
| Root collections | 80                 |
| Documents total  | 42,265             |

## Root collections (name + count)

Counts from Firestore aggregation API.

| Collection                   | Count                                                | Tenant keys (sample)                  | Drift             | Delta      |
| ---------------------------- | ---------------------------------------------------- | ------------------------------------- | ----------------- | ---------- |
| activityLogs                 | 18074                                                | businessId, organizationId            | STABLE            | DELTA_SAFE |
| qr_link_audit_events         | 6697                                                 | businessId, organizationId            | STABLE            | PARTIAL*   |
| qr_link_versions             | 5100                                                 | businessId, organizationId            | STABLE            | PARTIAL*   |
| lotoProcedures               | 2539                                                 | businessId, organizationId, tenantId  | STABLE            | DELTA_SAFE |
| qr_links                     | 2524                                                 | businessId, organizationId            | STABLE            | DELTA_SAFE |
| assetRecords                 | 2489                                                 | businessId, organizationId, companyId | STABLE            | DELTA_SAFE |
| auth_audit_logs              | 1198                                                 | organizationId                        | STABLE            | PARTIAL*   |
| personnelRecords             | 1097                                                 | businessId, organizationId, companyId | STABLE            | DELTA_SAFE |
| lotoLibraries                | 275                                                  | businessId, organizationId, tenantId  | STABLE            | DELTA_SAFE |
| companyVehicleDrivers        | 201                                                  | businessId, organizationId            | SIGNIFICANT_DRIFT | DELTA_SAFE |
| workersCompAuditEvents       | 121                                                  | businessId, organizationId            | STABLE            | DELTA_SAFE |
| platformNotificationOutbox   | 105                                                  | businessId                            | STABLE            | PARTIAL*   |
| chemicalSafetyRecords        | 104                                                  | businessId, organizationId, companyId | STABLE            | DELTA_SAFE |
| warehouseSafetyRecords       | 102                                                  | businessId, organizationId, companyId | STABLE            | DELTA_SAFE |
| departments                  | 88                                                   | organizationId                        | STABLE            | DELTA_SAFE |
| sites                        | 27                                                   | organizationId                        | STABLE            | DELTA_SAFE |
| _(remaining 64 collections)_ | _(see `.tmp-data-migration/dm-s0/collections.json`)_ |                                       |                   |            |

\*Exact delta class for every collection is in machine evidence; table highlights largest volumes.

Full alphabetized list of all 80 root collection names is recorded in the DM-S0 machine summary and tooling output (gitignored). Names include industrial modules (LOTO, DOT, confined space, hot work, heights, electrical, cranes, machine/chemical/warehouse/manufacturing/contractor/process/environmental safety, WC family, training, forms, inspections, incidents, QR/scan, platform billing, etc.).

## Subcollections

| Parent                    | Subcollection | Path pattern                             | Notes                                          |
| ------------------------- | ------------- | ---------------------------------------- | ---------------------------------------------- |
| equipmentMigrationBatches | rows          | `equipmentMigrationBatches/{docId}/rows` | Only nested pattern observed in sampled probes |

Bounded probe: 5 docs/collection. Historical nested collections not present in samples are still possible — DM-S1 should re-probe per collection with higher coverage for high-risk modules.

## Schema profiling

- Sample size per collection: up to 25 documents
- Field union + type classification (string/boolean/integer/double/null/timestamp/geopoint/reference/bytes/array/map)
- Notable drift: `companyVehicleDrivers` = **SIGNIFICANT_DRIFT**
- Most operational collections: **STABLE**

Sensitive values are not copied into committed docs.

## Firebase Auth

| Metric             | Value                                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------------------- |
| Total users        | 10                                                                                                            |
| Enabled            | 10                                                                                                            |
| Disabled           | 0                                                                                                             |
| Providers          | `password` × 10                                                                                               |
| MFA enrolled       | 0 (none observed)                                                                                             |
| Business claim IDs | `business-1782553339499`, `business-forge-default`                                                            |
| Linkage            | custom claims `businessIds` / `businessId` / `businesses` (+ optional Firestore user/personnel join in DM-S1) |

Auth user count is far below personnel record count → most workers are **not** Firebase Auth users.

## Storage

| Bucket                                                 | Purpose                    | Objects           | Bytes          |
| ------------------------------------------------------ | -------------------------- | ----------------- | -------------- |
| `forge-industrial-safety.firebasestorage.app`          | Customer/app files         | 9303              | 16,568,761,846 |
| `forge-industrial-safety-firestore-migration-20260811` | Firestore export/migration | 351               | 41,606,561     |
| `industrialsafety_data_export`                         | Export staging             | 0                 | 0              |
| `industrialsafety_data_migration`                      | Migration staging          | 0                 | 0              |
| `gcf-v2-*`                                             | Functions infra            | skipped deep list | —              |

Customer path prefixes (prior + live): `module-attachments/`, `tenants/`, `dot-compliance/`, `certificates/`, `equipment-migrations/`, `training-imports/`, `dqf-exports/`.

## Realtime Database

**NOT USED** — shallow HTTPS probe returned HTTP 404 for default RTDB URL.

## Cloud Functions (cutover writers)

Active functions include (non-exhaustive of triggers): auth/password provisioning, billing/notification email, LOTO PDF parse, equipment migration/document writers, training import, QR/scan resolvers, form PDF sign, membership claim sync (`syncBusinessClaimsOnMembershipWrite`, `syncMyBusinessClaims`).

These must be inventoried for write-freeze in a later cutover sprint. **Not disabled in DM-S0.**

## Indexes

- Composite indexes observed: **92**
- Index field patterns confirm primary tenant query key `businessId` (+ `createdAt` sorts) on high-volume collections such as `activityLogs`.

## Security rules

Rules were not redeployed. Live rule text should be exported read-only in DM-S1 evidence packaging. Prior industrial program docs indicate business/membership scoped access; treat live rules as authoritative at cutover.

## Source vs prior code knowledge

| Class         | Notes                                                                            |
| ------------- | -------------------------------------------------------------------------------- |
| LIVE_AND_CODE | Core industrial collections previously used in ind-11 extract waves              |
| LIVE_ONLY     | Several platform/billing/scan/WC satellite collections beyond early wave loaders |
| CODE_ONLY     | None asserted without a live miss — DM-S0 enumerated live roots directly         |

## Export bucket readiness

`FIRESTORE_EXPORT_BUCKET: READY`  
Preferred existing bucket: `forge-industrial-safety-firestore-migration-20260811`
