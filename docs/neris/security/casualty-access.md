# Casualty Access Controls

## Principles

- Least privilege: fire-service casualty permissions are separate from ordinary incident edit
- Masked list views by default; full detail only with view permission and explicit `full=true` where applicable
- Access events written to `neris_casualty_access_audit` without storing restricted health content in audit payloads
- Restricted casualty fields must not appear in general incident-list summaries or ordinary application logs
- No ePCR clinical documents in NERIS casualty tables

## Permissions

| Permission                                       | Purpose                       |
| ------------------------------------------------ | ----------------------------- |
| `rms.neris.civilian_casualty.view` / `.edit`     | Civilian casualty access      |
| `rms.neris.fire_service_casualty.view` / `.edit` | Fire-service casualty access  |
| `rms.neris.safety_review`                        | Safety officer review actions |

Specialized reviewer roles in starter templates grant scoped access without unrestricted rights to unrelated restricted data.
