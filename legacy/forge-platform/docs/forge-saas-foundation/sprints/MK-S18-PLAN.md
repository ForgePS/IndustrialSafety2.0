# MK-S18 Plan — Search / Command Palette

## Objective

Productize authorized global search and a command palette for Creator Console and Tenant Admin. Authorization runs before hits are returned. Reuse `ForgeSearchTrigger`; no framework change; no industrial redesign; no production ops.

## Changes

1. Contracts `search-domain` + optional `platform.search.read`
2. Nest `SearchModule` with tenant/membership/facility/module providers (authz-before-map)
3. `@forge/ui` command palette shell + app `ConnectedCommandPalette`
4. Enable search trigger + Ctrl/Cmd+K in CC/TA shells
5. Local commands: navigate, switch tenant, open settings, create via existing routes
6. Docs `SEARCH_COMMAND_PALETTE.md`

## Out of scope

- Industrial/Sneat redesign
- Elasticsearch / OpenSearch
- RMS operational entity search
- Production deploy
- Facility ACL depth (BACKLOG-016)
