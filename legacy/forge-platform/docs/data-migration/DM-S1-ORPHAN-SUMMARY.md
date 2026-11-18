# DM-S1 Orphan Reference Summary (Redacted)

**Sprint:** DM-S1  
**Mode:** READ-ONLY relationship scan  
**Raw report:** `.tmp-data-migration/dm-s1/orphan-references.json` (gitignored)

## Scope

Checks (sampled, bounded pagination):

- Soft facility links: `site` display-name → `sites.name`
- Hard facility links: `locationId` → `sites/{id}` when present
- LOTO `businessId` → organizations/business registry
- LOTO `equipmentExternalId` → `assetRecords` (external tags may legitimately miss)
- Training enrollment `userId` → `personnelRecords`
- Auth vs organization_users / platformUsers population note

## Key structural finding

Operational modules often store **facility as a display-name string** in field `site` (e.g. site nicknames), while `sites` documents use ids like `loc-*` and official `name` values. Many soft name matches fail → classify as **AMBIGUOUS_FACILITY_NAME**, not automatically repairable hard FK orphans.

`locationId` hard links are sparse but reconcile when present.

## Aggregate results (DM-S1 scan)

| Metric                                                    |                              Value |
| --------------------------------------------------------- | ---------------------------------: |
| Relationships checked                                     |                                 10 |
| Orphan / mismatch reference count (sampled)               |                               2235 |
| Soft site-name mismatches (personnel/incident/inspection) |                                145 |
| Soft site-name mismatches (asset sample)                  |                  0 of 2000 sampled |
| LOTO equipmentExternalId not Firestore asset ids          | 2090 (expected external-tag class) |
| Hard locationId misses                                    |                   0 (when present) |
| LOTO businessId registry misses                           |                                  0 |
| Storage OWNERSHIP_CONFIRMED                               |                               9290 |
| Storage PLATFORM_GLOBAL                                   |                                 12 |
| Storage AMBIGUOUS                                         |                                  1 |
| Storage ORPHAN                                            |                                  0 |

## Actions before AWS import

1. Build a facility name→`industrial_sites` resolution table (manual + fuzzy) for soft `site` strings.
2. Quarantine unresolved AMBIGUOUS_FACILITY_NAME rows.
3. Treat LOTO `equipmentExternalId` as external tag unless proven Firestore asset id.
4. Do not attach AMBIGUOUS Storage objects to arbitrary tenants.
5. Resolve LEGACY_ALIAS tenant keys separately (`DM-S1-TENANT-MAPPING.md`).

## No repairs

Source Firebase records were **not** modified.
