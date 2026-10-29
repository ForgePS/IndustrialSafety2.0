# S2F-1 Incidents — Baseline

**Module:** Incidents  
**Date:** 2026-07-30

## Routes

| Route                       | Purpose                    |
| --------------------------- | -------------------------- |
| `/incidents/`               | List + search + pagination |
| `/incidents/new/`           | Manual intake create       |
| `/incidents/[id]/?section=` | Workspace / sections       |

## Product gates

- `rms.neris.incident_shell.enabled`
- `rms.neris.manual_intake.enabled`
- Specialty / CAD / AI narrative product flags (unchanged)

## Observed statuses (actual app)

`DRAFT`, review-related (`READY_FOR_REVIEW`, `SUBMITTED_FOR_REVIEW`, `RETURNED_FOR_CORRECTION`, `APPROVED`), `FINALIZED`, `VOIDED`, `ARCHIVED` (and other API-returned values). Lifecycle transitions unchanged.

## APIs (unchanged)

`listIncidents`, `createIncident`, `getIncident`, `patchIncident`, `batchFieldValues`, narrative, form descriptor, specialty, attachments, CAD status, review actions — existing `rms-api` / `specialty-api` only.
