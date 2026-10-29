# Import Platform API (S2)

Base path: **`/api/v1/imports`**

All mutating routes that can duplicate work require `Idempotency-Key` (see ADR-022).

Identity and tenant come from the authenticated principal. Request bodies must not include `tenantId`, `createdBy`, or privileged status fields.

## Jobs

| Method | Path                               | Permission                          |
| ------ | ---------------------------------- | ----------------------------------- |
| POST   | `/jobs`                            | `import.upload`                     |
| GET    | `/jobs`                            | `import.view`                       |
| GET    | `/jobs/:jobId`                     | `import.view`                       |
| PATCH  | `/jobs/:jobId`                     | `import.upload`                     |
| POST   | `/jobs/:jobId/cancel`              | `import.upload` or `import.approve` |
| POST   | `/jobs/:jobId/request-validation`  | `import.validate`                   |
| POST   | `/jobs/:jobId/request-preview`     | `import.preview`                    |
| POST   | `/jobs/:jobId/submit-for-approval` | `import.preview`                    |
| POST   | `/jobs/:jobId/approve`             | `import.approve`                    |
| POST   | `/jobs/:jobId/reject`              | `import.approve`                    |
| GET    | `/jobs/:jobId/mappings`            | `import.view`                       |
| PUT    | `/jobs/:jobId/mappings`            | `import.map`                        |
| DELETE | `/jobs/:jobId/mappings/:mappingId` | `import.map`                        |

### Create job body

`productKey`, `moduleKey`, `recordCategory`, `sourceType`, optional `profileId`, `displayName`, optional `description`, `requestedMode`, optional `clientRequestId`.

Initial status: `READY_FOR_MAPPING`.

### List filters

`page`, `pageSize` (max 100), `search`, `status`, `productKey`, `moduleKey`, `recordCategory`, `createdFrom`, `createdTo`, `createdBy`, `sort`, `sortDir`.

## Profiles

| Method | Path                           | Permission              |
| ------ | ------------------------------ | ----------------------- |
| POST   | `/profiles`                    | `import.profile.manage` |
| GET    | `/profiles`                    | `import.view`           |
| GET    | `/profiles/:profileId`         | `import.view`           |
| PATCH  | `/profiles/:profileId`         | `import.profile.manage` |
| POST   | `/profiles/:profileId/archive` | `import.profile.manage` |
| POST   | `/profiles/:profileId/restore` | `import.profile.manage` |

## Templates

| Method | Path                      | Permission    |
| ------ | ------------------------- | ------------- |
| GET    | `/templates`              | `import.view` |
| GET    | `/templates/:templateKey` | `import.view` |

Returns metadata/schema contracts only (no file generation).

## Cancel rule

Cancel is allowed with `import.upload` or `import.approve` while status is `READY_FOR_MAPPING`, `MAPPED`, or `AWAITING_APPROVAL`.

## Stable error codes

`IMPORT_JOB_NOT_FOUND`, `IMPORT_PROFILE_NOT_FOUND`, `IMPORT_TEMPLATE_NOT_FOUND`, `IMPORT_PERMISSION_DENIED` (via FORBIDDEN details), `IMPORT_INVALID_STATE_TRANSITION`, `IMPORT_VALIDATION_REQUEST_NOT_AVAILABLE`, `IMPORT_PREVIEW_REQUEST_NOT_AVAILABLE`, `IMPORT_APPROVAL_NOT_AVAILABLE`, `IMPORT_IDEMPOTENCY_CONFLICT` / platform `IDEMPOTENCY_CONFLICT`, `IMPORT_MAPPING_INVALID`, `IMPORT_TENANT_CONTEXT_REQUIRED`, `IMPORT_ENTITLEMENT_REQUIRED`.
