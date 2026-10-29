# Repeatable Specialty Records API

Base: `/api/v1/tenants/{tenantId}/neris/incidents/{incidentId}`

Requires authentication, tenant resolution, `rms.neris.specialty_workflows.enabled`, and family permissions. Mutations require `If-Match` where noted.

| Resource                                | Methods                        |
| --------------------------------------- | ------------------------------ |
| `/exposures`                            | GET, POST                      |
| `/exposures/{id}`                       | GET, PATCH                     |
| `/exposures/{id}/archive`               | POST                           |
| `/exposures/{id}/restore`               | POST                           |
| `/civilian-casualties`                  | GET (`?full=true`), POST       |
| `/civilian-casualties/{id}`             | GET, PATCH                     |
| `/civilian-casualties/{id}/archive`     | POST                           |
| `/fire-service-casualties`              | GET (`?full=true`), POST       |
| `/fire-service-casualties/{id}`         | GET, PATCH                     |
| `/fire-service-casualties/{id}/archive` | POST                           |
| `/hazmat/substances`                    | GET, POST; PATCH/archive by id |
| `/hazmat/containers`                    | GET, POST; PATCH/archive by id |
| `/alarm-systems`                        | GET, POST; PATCH/archive by id |
| `/protection-systems`                   | GET, POST; PATCH/archive by id |
| `/attachments`                          | GET                            |
| `/attachments/uploads`                  | POST initialize                |
| `/attachments/{id}/complete`            | POST                           |
| `/attachments/{id}`                     | GET, PATCH                     |
| `/attachments/{id}/archive`             | POST                           |
| `/occupancy-links`                      | GET, POST                      |
| `/proposed-master-updates`              | POST                           |
| `/section-approvals`                    | POST                           |

Proposed update review: `PATCH /api/v1/tenants/{tenantId}/neris/proposed-master-updates/{proposalId}` (`rms.masterdata.manage`).

Specialty validation runs through existing `POST …/validate`.
