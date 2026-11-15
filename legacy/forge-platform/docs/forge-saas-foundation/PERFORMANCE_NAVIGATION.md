# Performance / Navigation (MK-S17)

## Principles

- Do not change framework (Next App Router + `output: "export"` stays)
- Keep authz GETs as `cache: "no-store"` — never share cross-tenant response caches
- Prefer session tenant over stale `?tenantId=` for non-platform admins
- Ignore in-flight responses after tenant switch (abort / generation guards)

## Changes

| Area            | Hardening                                                |
| --------------- | -------------------------------------------------------- |
| Tenant identity | `resolveActiveTenantId` + `syncTenantIdInUrl` on switch  |
| Fetch races     | generation/abort guards on notifications, audit, members |
| Notifications   | unread-count on mount; list only when menu opens         |
| Audit           | honest `total` from API + page controls                  |
| Members         | client pagination (25/page) + clear-on-switch            |
| Navigation      | memoized group filter                                    |
| Bundle          | `next/dynamic` for Config Studio namespaces              |

## Helpers

- `@forge/web-kit`: `useTenantScopedEffect`, `resolveActiveTenantId`, `syncTenantIdInUrl`, `AbortSignal` on api client
- Tenant Admin mirrors sync/resolve locally (no web-kit auth package coupling)

## Explicit non-goals

- React Query / SWR shared caches
- MK-S18 search / command palette
- Industrial shell redesign
- Production deploy
