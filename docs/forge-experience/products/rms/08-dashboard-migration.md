# Dashboard Migration Plan (FX-S2C)

**Document:** `08-dashboard-migration.md`  
**Gate:** FX-S2C  
**Status:** IMPLEMENTED (default-off)

## Implementation

| Piece       | Path                                       |
| ----------- | ------------------------------------------ |
| Framework   | `apps/rms-web/src/fx/dashboard/`           |
| Flag        | `fx.rms.dashboard.enabled` (default false) |
| FX home     | `DashboardPage`                            |
| Legacy home | `LegacyHomeDashboard`                      |
| Switch      | `apps/rms-web/src/app/page.tsx`            |

## Live widgets only

quick-actions · recent-incidents · review-queue · cad-status · cad-conflicts · my-work · notifications (honest unavailable) · system-status

No Personnel / Prevention / fabricated executive metrics.

## Rollback

Disable flag → legacy home immediately. Route `/` unchanged.
