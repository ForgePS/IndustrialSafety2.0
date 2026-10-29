# RMS Master Data (Phase 2 foundations)

Phase 2 introduces minimal reusable master data for manual intake prefill and lookups. Full standalone RMS modules (inventory, scheduling products, etc.) are deferred.

## Tables (migration `0009`)

| Table                                          | Purpose                                                        |
| ---------------------------------------------- | -------------------------------------------------------------- |
| `rms_stations`                                 | Fire stations / districts                                      |
| `rms_shifts`                                   | Shift definitions                                              |
| `rms_apparatus`                                | Apparatus records                                              |
| `rms_units`                                    | Response units                                                 |
| `rms_personnel`                                | Personnel linked to shared `persons` (no identity duplication) |
| `rms_daily_rosters` / `rms_roster_assignments` | Daily roster and assignments                                   |
| `rms_occupancies`                              | Occupancy records for location prefill                         |
| `rms_preplans`                                 | Preplan references                                             |

All tables: tenant-scoped UUID PKs, audit columns, `record_version`, soft delete where applicable, FORCE RLS.

## API module

`RmsMasterDataModule` at `/api/v1/tenants/{tenantId}/rms/{resource}`.

Resources: `stations`, `shifts`, `apparatus`, `units`, `personnel`, `rosters`, `occupancies`, `preplans`.

Patterns mirror platform core: pagination, search, `@Idempotent` create, ETag/If-Match on patch/delete, outbox + audit inside `withTenantTransaction`.

## Permissions

| Permission              | Scope                |
| ----------------------- | -------------------- |
| `rms.masterdata.read`   | List/get lookups     |
| `rms.masterdata.manage` | Create/update/delete |

Granular per-domain permission codes are deferred; documented here for future splits.

## Prefill integration

`IncidentPrefillService` records `prefill_source` on field values (`ROSTER`, `PERSONNEL`, `APPARATUS`, `OCCUPANCY`, `PREPLAN`, etc.). User-confirmed values are never silently overwritten.

## API reference

See [Master data API](../api/master-data.md).

## Deferrals

- Full CRUD admin UX for every master-data domain
- Import/sync from external CAD or RMS systems
- CAD-driven roster automation
