# 28 — Dashboard Widget Registry

**Date:** 2026-07-30  
**Code:** `apps/rms-web/src/fx/dashboard/widgets/register-all.ts`

| ID               | Title                 | Category      | Data source                       | Product flag                       |
| ---------------- | --------------------- | ------------- | --------------------------------- | ---------------------------------- |
| quick-actions    | Quick actions         | quick-actions | Enabled capability links          | none (filters by flags)            |
| recent-incidents | Recent incidents      | operational   | `listIncidents`                   | `rms.neris.incident_shell.enabled` |
| review-queue     | Incident review queue | queues        | `listIncidents` + review statuses | `rms.neris.officer_review.enabled` |
| cad-status       | CAD status            | status        | `getCadOperationsSummary`         | `rms.cad.operations.enabled`       |
| cad-conflicts    | CAD conflict queue    | queues        | `openConflicts` from summary      | `rms.cad.enabled`                  |
| my-work          | My Work               | activity      | Links to existing queues          | per-link flags                     |
| notifications    | Notifications         | notifications | None (honest empty)               | none                               |
| system-status    | System status         | status        | Env label + `/health/`            | none                               |

No invented modules. Widgets self-register via `registerDashboardWidget`.
