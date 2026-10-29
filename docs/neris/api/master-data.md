# RMS Master Data API (Phase 2)

Base path: `/api/v1/tenants/{tenantId}/rms/{resource}`

All list responses use the standard Forge envelope with pagination meta. Mutations on versioned resources require `If-Match: W/"<recordVersion>"` and return an `ETag` header.

## Resources

| Resource    | Path segment  | Notes                  |
| ----------- | ------------- | ---------------------- |
| Stations    | `stations`    | Paginated list, search |
| Shifts      | `shifts`      |                        |
| Apparatus   | `apparatus`   |                        |
| Units       | `units`       |                        |
| Personnel   | `personnel`   | FK to shared `persons` |
| Rosters     | `rosters`     | Daily roster headers   |
| Occupancies | `occupancies` | Location prefill       |
| Preplans    | `preplans`    | Preplan references     |

## Common operations

| Method         | Permission              | Description                                |
| -------------- | ----------------------- | ------------------------------------------ |
| `GET /`        | `rms.masterdata.read`   | List with `page`, `pageSize`, `search`     |
| `GET /{id}`    | `rms.masterdata.read`   | Get single record                          |
| `POST /`       | `rms.masterdata.manage` | Create (idempotent with `Idempotency-Key`) |
| `PATCH /{id}`  | `rms.masterdata.manage` | Update (requires `If-Match`)               |
| `DELETE /{id}` | `rms.masterdata.manage` | Soft delete where applicable               |

## Rosters

Additional endpoints:

| Method   | Path                                             | Description       |
| -------- | ------------------------------------------------ | ----------------- |
| `POST`   | `/rosters/{rosterId}/assignments`                | Add assignment    |
| `DELETE` | `/rosters/{rosterId}/assignments/{assignmentId}` | Remove assignment |

## Implementation

- Module: `apps/platform-api/src/modules/rms/`
- Contracts: `packages/contracts/src/rms-neris.ts`

## Related

- [Architecture: master data](../architecture/master-data.md)
- [Incidents API](./incidents.md)
