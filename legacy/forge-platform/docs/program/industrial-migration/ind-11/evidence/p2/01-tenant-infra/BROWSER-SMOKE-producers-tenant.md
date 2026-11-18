# Producers P2 Phase 1 — host smoke (Producers tenant)

**Date:** 2026-08-05  
**Host:** `https://producers-rice-mill.forgepublicsafety.com/`  
**User:** `ba491113…` / Cognito sub `e498c4d8-…`

## Result

| Check | Result |
| --- | --- |
| Session load | PASS |
| Active tenant | **Producers Rice Mill** (`5da680d3-50f5-46ac-8b85-6cf454b6a0da`) |
| Industrial shell / dashboard | PASS |
| Day-1 modules available (flags ON) | Personnel, Incidents, Inspections, Training, Forms, QR Links, Documents, Reporting, Import, Emergency Response, Task Scheduler, Messaging, LOTO, Equipment, Confined Space, Hot Work |
| Non–day-1 modules | Show `(flag off)` as expected |

## Prerequisites applied this session

- Cognito user linked to staging + prod twin memberships (`p2-link-creator-producers-result.json`)
- CORS origin for Producers host already on API (`:65`)
- Sticky tenant via `forge-active-tenant-id`

Not production cutover (Phase 5 still pending).
