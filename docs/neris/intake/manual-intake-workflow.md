# MANUAL_ONLY Intake Workflow

Phase 2 supports **MANUAL_ONLY** operating mode first. CAD adapters, CAD UI, and CAD credentials are explicitly out of scope.

## User journey

1. **Start** — rms-web home shows "Create Manual Incident" when `rms.neris.manual_intake.enabled` is true. No CAD banners or import actions.
2. **Create** — `POST /neris/incidents` assigns incident number, pins schema snapshot, creates default sections, returns ETag.
3. **Workspace** — Guided sections with persistent header, section nav, completion indicators, autosave status, validation summary, save-and-exit.
4. **Validate** — Progressive validation; blocking errors prevent `READY_FOR_REVIEW`.
5. **Submit** — Officer review flow when `rms.neris.officer_review.enabled` (see [officer review](../review/officer-review-workflow.md)).
6. **Finalize** — Locks protected fields; configuration snapshot written.

## Workspace sections

| Order | Section            | Content                                            |
| ----- | ------------------ | -------------------------------------------------- |
| 1     | Overview           | Basics, incident date, station                     |
| 2     | Dispatch           | Alarm/dispatch/en-route/arrival/cleared timestamps |
| 3     | Location           | Address, geolocation, occupancy link               |
| 4     | Units & personnel  | Roster-driven unit/personnel assignment            |
| 5     | Classification     | Incident type / classification fields              |
| 6     | Applicable modules | Condition-driven module visibility                 |
| 7     | Narrative          | Plain-text narrative with templates                |
| 8     | Review             | Validation summary before submit                   |

Rendering: [form rendering architecture](../architecture/form-rendering.md).

## Autosave

Debounced section saves with If-Match concurrency — see [autosave and concurrency](./autosave-and-concurrency.md).

## Prefill

Values may arrive from tenant defaults, roster, personnel, apparatus, occupancy, or preplan sources. `user_confirmed` prevents silent overwrite.

## Duplicate detection

`POST …/duplicates/check` is advisory only — never auto-merges drafts.

## Feature flags required

| Step      | Flag                               |
| --------- | ---------------------------------- |
| Any write | `rms.neris.incident_shell.enabled` |
| Create    | `rms.neris.manual_intake.enabled`  |
| Review    | `rms.neris.officer_review.enabled` |

## Out of scope

- CAD_ENABLED / HYBRID intake paths
- Offline sync
- External NERIS submission
