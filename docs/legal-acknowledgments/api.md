# Legal Acknowledgments — API

## User

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/v1/legal/requirements/current` | Pending + status for login gate |
| GET | `/api/v1/legal/documents/:documentId/versions/:versionId` | Exact version body |
| POST | `/api/v1/legal/acknowledgments` | Batch accept (idempotent) |
| GET | `/api/v1/legal/acknowledgments/me` | Profile history |
| POST | `/api/v1/legal/attestations` | Sign transaction attestation |
| GET | `/api/v1/legal/attestations/:id` | Read attestation evidence |

## Admin

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/v1/legal/admin/documents` | List docs (`scope=global\|tenant\|all`) |
| GET | `/api/v1/legal/admin/documents/:id/versions` | Version history |
| POST | `/api/v1/legal/admin/tenant-policies` | Create/publish tenant policy |
| POST | `/api/v1/legal/admin/documents/:id/versions/publish` | Publish new immutable version |
| GET | `/api/v1/legal/admin/acknowledgments` | Tenant acknowledgment list |
| GET | `/api/v1/legal/admin/acknowledgments/export` | CSV export |
| GET | `/api/v1/legal/admin/acknowledgments/:id` | Evidence detail |

`auth/me` includes `legalAcknowledgments` when Industrial product is active.
