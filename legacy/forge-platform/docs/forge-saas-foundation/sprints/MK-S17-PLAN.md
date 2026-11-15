# MK-S17 Plan — Performance / Navigation

## Objective

Harden Creator Console and Tenant Admin performance/navigation without changing framework. Focus on stale tenant races, duplicate/in-flight fetches, honest pagination, and safe list loading. Authorization-sensitive data must never paint after a tenant switch.

## Changes

1. web-kit tenant-scoped fetch helper (AbortSignal + generation guard)
2. Sync/clear `?tenantId=` on switch; harden `useTenantId` preference
3. Notification menu clears/aborts on tenant change; avoid eager list duplication where practical
4. Audit list: real `total` + UI page controls
5. Large TA tables: client pagination via existing list-controls
6. Memoize nav filter; selective `next/dynamic` for heavy Config Studio
7. Docs `PERFORMANCE_NAVIGATION.md`

## Out of scope

- New UI framework / React Query / SWR shared caches
- MK-S18 search
- Industrial/Sneat redesign
- Production deploy
- Removing `cache: "no-store"` from authz GETs
