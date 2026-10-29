# Import Platform S8 — UI Performance

**Document:** `docs/testing/import-platform-s8-ui-performance.md`  
**Date:** 2026-07-30  
**Status:** **NOT_VERIFIED**

## Expectation

Import Center must not load full datasets into the browser. Pagination / metadata-only lists for large jobs.

## Measurements required

| Scenario                                                    | Status                                       |
| ----------------------------------------------------------- | -------------------------------------------- |
| Dashboard with many jobs                                    | **NOT_VERIFIED**                             |
| Results/errors views at 500 / 5k / 25k / 100k metadata rows | **NOT_VERIFIED**                             |
| Mapping grid responsiveness                                 | **NOT_VERIFIED** (narrow screen LIM-IMP-008) |
| Polling monitor CPU/jank                                    | **NOT_VERIFIED**                             |

## Design mitigations (unmeasured)

- Paginated API lists
- No product adapters shipping full catalogs

Do not claim UI scale passes without timings.

## Related

- Gap GAP-023 / DEF-S8-004
