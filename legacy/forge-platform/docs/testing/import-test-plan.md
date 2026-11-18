# Import Platform — Test Plan

**Status:** Draft  
**Date:** 2026-07-28  
**Strategy:** `docs/architecture/import-platform/IMPORT_TEST_STRATEGY.md`  
**Target:** 0 failed / 0 skipped at Definition of Done

## Current architecture-stop coverage

| Suite                         | Status                                         |
| ----------------------------- | ---------------------------------------------- |
| `@forge/imports` unit smoke   | Required green for skeleton                    |
| API / RLS / Playwright / a11y | Planned — not run until implementation sprints |

## Implementation sprint checklist

- [ ] Unit: formats, validation rules, duplicates, transforms
- [ ] Integration: staging tables + RLS
- [ ] API contract tests for all `/api/v1/import/*` routes
- [ ] Tenant isolation API matrix
- [ ] Duplicate action matrix
- [ ] Rollback safe / unsafe
- [ ] Performance large CSV
- [ ] Playwright Import Center
- [ ] Accessibility (axe + keyboard wizard)

Evidence directory (future): `docs/testing/evidence/import-platform/`
