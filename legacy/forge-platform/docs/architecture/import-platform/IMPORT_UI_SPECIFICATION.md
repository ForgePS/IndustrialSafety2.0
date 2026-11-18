# Universal Import Platform — UI Specification

**Status:** ARCHITECTURE  
**Date:** 2026-07-28

## Surfaces

| Surface                         | Audience                                       |
| ------------------------------- | ---------------------------------------------- |
| Creator Console — Import Center | Platform operators / support                   |
| Tenant Admin — Import Center    | Tenant administrators / configuration managers |
| Shared components               | Design-system based wizard steps               |

Reuse shared UI components; do not fork separate Academy/RMS/Industrial importers.

## Wizard flow

1. Select Product
2. Select Module
3. Select Record Type
4. Download Template
5. Upload File
6. Map Columns
7. Resolve Errors
8. Preview
9. Approve
10. Execute
11. Monitor Progress
12. Review Results
13. Rollback (where allowed)

## UX rules

- No browser-side full-file parse; upload to presigned URL; poll job status
- Progress from `GET .../status` (percent, stage, counts)
- Error table with filters; export rejected rows
- Duplicate Merge Review as dedicated step when candidates require human choice
- Accessibility: keyboard operable wizard, focus order, live regions for progress, labeled tables (align with platform a11y targets)

## Configuration Platform

Profile picker loads published `import_config` profiles via config effective/catalog APIs. Editing canonical profiles remains in Configuration Studio (frozen feature set)—Import Center only snapshots/overrides for the job.
