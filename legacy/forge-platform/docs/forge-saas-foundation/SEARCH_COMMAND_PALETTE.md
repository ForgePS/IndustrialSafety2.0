# Search / Command Palette (MK-S18)

## Principles

- Authorization runs **before** hit mapping — denied providers omit groups (no lock teasers)
- Search is scoped to the active tenant path (`GET /api/v1/tenants/:tenantId/search`)
- Non–platform-admins must match `principal.tenantId` to the path tenant
- Reuse `ForgeSearchTrigger`; command palette lives in `@forge/ui`
- No Elasticsearch; Postgres `ILIKE` providers only
- Industrial / Sneat shell search is out of scope

## API

| Item      | Detail                                                                             |
| --------- | ---------------------------------------------------------------------------------- |
| Route     | `GET /api/v1/tenants/:tenantId/search?q=&types=&limitPerType=`                     |
| Query     | `q` (1–100), optional `types` CSV, optional `limitPerType` (1–25, default 8)       |
| Providers | `tenant`, `membership`, `facility`, `module`                                       |
| Authz     | Per-provider permission gates (see below)                                          |
| Response  | `{ groups: [{ type, label, hits: [{ id, title, subtitle?, href, tenantId? }] }] }` |

### Provider permissions

| Type       | Permission                    |
| ---------- | ----------------------------- |
| tenant     | `platform.tenant.read`        |
| membership | `platform.membership.read`    |
| facility   | `tenant.facilities.read`      |
| module     | `platform.entitlement.manage` |

## UI

- `ForgeCommandPalette` + enabled `ForgeSearchTrigger` in `@forge/ui`
- Creator Console / Tenant Admin: `ConnectedCommandPalette`
  - Ctrl/Cmd+K
  - Local commands: navigate (filtered nav), switch tenant, create (when permitted), settings
  - Debounced remote search (≥2 chars) against the search API
  - TA remaps hit hrefs to tenant-admin routes + `tenantId` query

## Explicit non-goals

- OpenSearch / Elasticsearch
- RMS operational entity search
- Deep facility ACL (BACKLOG-016)
- Industrial redesign
- Production deploy
