# NERIS Incidents API (Phase 2 / Phase 3)

Base path: `/api/v1/tenants/{tenantId}/neris/incidents`

All responses use the standard Forge envelope `{ data, meta }`. Mutations on versioned resources require `If-Match: W/"<recordVersion>"` and return an `ETag` header.

## Feature flags

| Flag                                    | Gates                                              |
| --------------------------------------- | -------------------------------------------------- |
| `rms.neris.incident_shell.enabled`      | All write mutations (platform admin bypass)        |
| `rms.neris.manual_intake.enabled`       | `POST /` create                                    |
| `rms.neris.officer_review.enabled`      | Submit, return, approve, review comments           |
| `rms.neris.specialty_workflows.enabled` | Specialty evaluation + `POST …/specialty-sections` |

## Incidents

| Method  | Path                         | Permission                  | Description                                                      |
| ------- | ---------------------------- | --------------------------- | ---------------------------------------------------------------- |
| `POST`  | `/`                          | `rms.neris.incident.create` | Create incident (auto number, schema snapshot, default sections) |
| `GET`   | `/`                          | `rms.neris.incident.view`   | List incidents (`page`, `pageSize`, `search`)                    |
| `GET`   | `/{incidentId}`              | `rms.neris.incident.view`   | Get incident with sections                                       |
| `PATCH` | `/{incidentId}`              | `rms.neris.incident.edit`   | Patch overview/dispatch fields; promotes `DRAFT` → `IN_PROGRESS` |
| `PATCH` | `/{incidentId}/field-values` | `rms.neris.incident.edit`   | Batch upsert NERIS field values (respects `userConfirmed`)       |
| `POST`  | `/{incidentId}/validate`     | `rms.neris.validation.view` | Run validation; persists run + results                           |
| `POST`  | `/duplicates/check`          | `rms.neris.incident.view`   | Duplicate detection probe (`excludeIncidentId` query optional)   |

## Workflow

| Method | Path                              | Permission                         | Target status                |
| ------ | --------------------------------- | ---------------------------------- | ---------------------------- |
| `POST` | `/{incidentId}/submit-for-review` | `rms.neris.incident.submit_review` | `SUBMITTED_FOR_REVIEW`       |
| `POST` | `/{incidentId}/return`            | `rms.neris.incident.return`        | `RETURNED_FOR_CORRECTION`    |
| `POST` | `/{incidentId}/approve`           | `rms.neris.incident.approve`       | `APPROVED`                   |
| `POST` | `/{incidentId}/finalize`          | `rms.neris.incident.finalize`      | `FINALIZED` (locks incident) |
| `POST` | `/{incidentId}/void`              | `rms.neris.incident.void`          | `VOIDED`                     |
| `POST` | `/{incidentId}/archive`           | `rms.neris.incident.archive`       | `ARCHIVED`                   |

Configuration snapshots are written on submit and finalize.

## Form & narrative

| Method  | Path                               | Permission                | Description                                                                      |
| ------- | ---------------------------------- | ------------------------- | -------------------------------------------------------------------------------- |
| `GET`   | `/{incidentId}/form-descriptor`    | `rms.neris.incident.view` | Effective form descriptor (schema + overlays + conditions + specialty workflows) |
| `POST`  | `/{incidentId}/specialty-sections` | `rms.neris.incident.edit` | Activate or mark N/A a specialty section (`sectionKey`, `action`)                |
| `GET`   | `/{incidentId}/narrative`          | `rms.neris.incident.view` | Current narrative                                                                |
| `PATCH` | `/{incidentId}/narrative`          | `rms.neris.incident.edit` | Upsert narrative (versioned)                                                     |

### Specialty section actions

Body: `{ "sectionKey": "HAZMAT", "action": "ACTIVATE" | "MARK_NOT_APPLICABLE" | "CLEAR_NOT_APPLICABLE" }`

Does not delete field values. Core sections cannot be mutated through this endpoint.

## Audit & snapshots

| Method | Path                                    | Permission                     | Description                        |
| ------ | --------------------------------------- | ------------------------------ | ---------------------------------- |
| `GET`  | `/{incidentId}/status-history`          | `rms.neris.audit.view`         | Status transition history          |
| `GET`  | `/{incidentId}/review-comments`         | `rms.neris.incident.review`    | Review comments                    |
| `POST` | `/{incidentId}/review-comments`         | `rms.neris.incident.review`    | Add review comment                 |
| `GET`  | `/{incidentId}/schema-snapshot`         | `rms.neris.incident.view`      | Pinned schema snapshot from create |
| `GET`  | `/{incidentId}/configuration-snapshots` | `rms.neris.configuration.view` | Configuration snapshots            |
| `GET`  | `/{incidentId}/validation-runs`         | `rms.neris.validation.view`    | Validation run list                |
| `GET`  | `/{incidentId}/validation-runs/{runId}` | `rms.neris.validation.view`    | Validation run with results        |

## Default sections

Created on incident insert: `OVERVIEW`, `DISPATCH`, `LOCATION`, `UNITS_PERSONNEL`, `CLASSIFICATION`, `APPLICABLE_MODULES`, `NARRATIVE`, `REVIEW`.

## Incident numbering

Numbers are assigned server-side via `SELECT FOR UPDATE` on `neris_incident_number_sequences`. Format tokens: `{PREFIX}`, `{SUFFIX}`, `{YEAR2}`, `{YEAR4}`, `{STATION}`, `{AGENCY}`, `{SEQ:n}`. Default config is created lazily on first create.

## Units & personnel

| Method   | Path                                     | Permission                | Description                                                              |
| -------- | ---------------------------------------- | ------------------------- | ------------------------------------------------------------------------ |
| `GET`    | `/{incidentId}/units`                    | `rms.neris.incident.view` | List unit assignments (excludes soft-deleted)                            |
| `POST`   | `/{incidentId}/units`                    | `rms.neris.incident.edit` | Assign RMS unit to incident                                              |
| `PATCH`  | `/{incidentId}/units/{assignmentId}`     | `rms.neris.incident.edit` | Update assignment timestamps/role; requires `If-Match`                   |
| `DELETE` | `/{incidentId}/units/{assignmentId}`     | `rms.neris.incident.edit` | Soft-delete assignment; requires `If-Match`                              |
| `GET`    | `/{incidentId}/personnel`                | `rms.neris.incident.view` | List personnel assignments                                               |
| `POST`   | `/{incidentId}/personnel`                | `rms.neris.incident.edit` | Assign RMS personnel (optional `unitAssignmentId`)                       |
| `PATCH`  | `/{incidentId}/personnel/{assignmentId}` | `rms.neris.incident.edit` | Update personnel assignment; requires `If-Match`                         |
| `DELETE` | `/{incidentId}/personnel/{assignmentId}` | `rms.neris.incident.edit` | Soft-delete personnel assignment; requires `If-Match`                    |
| `GET`    | `/{incidentId}/prefill`                  | `rms.neris.incident.view` | Prefill candidates from station/personnel/occupancy/preplan query params |

Prefill query params: `stationId`, `personnelId`, `occupancyId`, `preplanId` (all optional; defaults from incident overview when omitted).

Mutations on units/personnel require the incident to be in an editable workflow status (`DRAFT`, `IN_PROGRESS`, `READY_FOR_REVIEW`, `RETURNED_FOR_CORRECTION`).

## RMS Web hosting

RMS Web is a static export deployed to S3 + CloudFront when `features.enableRmsHosting` is enabled. Sync: `pnpm deploy:rms-web`. See [deployment guide](../operations/deployment.md).

## RMS master data

Base path: `/api/v1/tenants/{tenantId}/rms/{resource}`

Resources: `stations`, `shifts`, `apparatus`, `units`, `personnel`, `rosters`, `occupancies`, `preplans`.

| Method                  | Permission              | Notes                                              |
| ----------------------- | ----------------------- | -------------------------------------------------- |
| `GET` (list/get)        | `rms.masterdata.read`   | Paginated list with `search`                       |
| `POST`/`PATCH`/`DELETE` | `rms.masterdata.manage` | Create idempotent; patch/delete require `If-Match` |

Rosters additionally expose `POST /rosters/{rosterId}/assignments` and `DELETE /rosters/{rosterId}/assignments/{assignmentId}`.
