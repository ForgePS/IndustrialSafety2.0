# Repeatable Specialty Records (Phase 3)

Specialty repeatable records are first-class, tenant-isolated tables linked to a parent incident. They do **not** replace the NERIS field-value store; schema-driven fields continue to use EAV where appropriate. Operational cards (exposures, casualties, hazmat, systems) use dedicated rows for numbering, validation, and security.

## Record families

| Family                  | Table                                    | Numbering                                                   |
| ----------------------- | ---------------------------------------- | ----------------------------------------------------------- |
| Exposures               | `neris_incident_exposures`               | Per-incident sequence (`neris_incident_exposure_sequences`) |
| Civilian casualties     | `neris_incident_civilian_casualties`     | UUID; masked list views                                     |
| Fire-service casualties | `neris_incident_fire_service_casualties` | UUID; separate permissions                                  |
| Hazmat substances       | `neris_incident_hazmat_substances`       | UUID                                                        |
| Hazmat containers       | `neris_incident_hazmat_containers`       | UUID; optional substance link                               |
| Alarm systems           | `neris_incident_alarm_systems`           | UUID                                                        |
| Protection systems      | `neris_incident_protection_systems`      | UUID                                                        |

## Shared behaviors

- Optimistic concurrency (`record_version` / `If-Match`)
- Archive instead of hard delete
- Finalized/voided/archived incidents reject edits
- Specialty feature flag required (`rms.neris.specialty_workflows.enabled`)
- Family-specific permissions
- Audit events on create/archive (casualties also write access audit without restricted payloads)

## API

See [repeatable-specialty-records API](../api/repeatable-specialty-records.md).

## Validation

`SpecialtyValidationService` contributes progressive findings into the shared validation run model (guidance / warning / blocking) with correction paths.
