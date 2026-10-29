# S2F-7 Administration & Utilities — Component Map

| Element                                             | Classification                      |
| --------------------------------------------------- | ----------------------------------- |
| `FxTable` / `FxTableEmpty` / `TableSectionBoundary` | Shared FX (select-tenant)           |
| `FxPanel` / `FxStatusBadge`                         | Shared FX primitives (health)       |
| `useRmsFxAdministrationModule`                      | Compatibility resolver              |
| `useRmsFxUtilitiesModule`                           | Compatibility resolver              |
| Legacy table / panel                                | Legacy Component Pending Retirement |
| `chooseTenant` / `apiFetchRaw("/health")`           | Existing web-kit / API behavior     |
