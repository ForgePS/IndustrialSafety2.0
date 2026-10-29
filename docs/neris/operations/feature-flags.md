# NERIS Feature Flags (Phase 2 / Phase 3)

Feature flags gate RMS capabilities per tenant. Platform administrators can bypass some gates for support. Phase 2 flags default to **false** in seed data until explicitly enabled on a tenant, except where noted for Phase 3.

## Product flags

| Flag key                                 | Gates                                                                                                                                                             |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rms.neris.incident_shell.enabled`       | All incident write mutations (platform admin bypass)                                                                                                              |
| `rms.neris.manual_intake.enabled`        | `POST /neris/incidents` create, New Incident UI                                                                                                                   |
| `rms.neris.officer_review.enabled`       | Submit, return, approve, review comments                                                                                                                          |
| `rms.neris.tenant_configuration.enabled` | Tenant NERIS configuration editor in rms-web                                                                                                                      |
| `rms.neris.specialty_workflows.enabled`  | Phase 3 specialty workflows, repeatable records, and attachments (defaults **false**; enable only via tenant override for approved synthetic development tenants) |

## Phase 1 flag (unchanged)

| Flag key                           | Gates                                     |
| ---------------------------------- | ----------------------------------------- |
| `rms.neris.schema_browser.enabled` | Creator Console read-only schema browsers |

## rms-web usage

Client constant map: `apps/rms-web/src/lib/feature-flags.ts` (via `@forge/web-kit` patterns).

`FeatureGate` component hides routes when the flag is off and shows a fallback message.

## Enabling on a tenant

1. Ensure migrations `0009`/`0010` are applied.
2. Set overrides on the tenant (platform admin API or seed script for synthetic FD).
3. Assign RMS starter role templates with `rms.neris.*` permissions.
4. Verify with `GET /api/v1/auth/me` permissions list.

Synthetic fire-department seed (Wave 7) enables all four Phase 2 flags only on the demo tenant — not globally.

## Infrastructure flags (CDK)

Separate from product flags — control whether CloudFront+S3 stacks are synthesized:

| Config                          | Default | Purpose                        |
| ------------------------------- | ------- | ------------------------------ |
| `features.enableConsoleHosting` | `true`  | Creator Console static hosting |
| `features.enableRmsHosting`     | `true`  | RMS Web static hosting         |

Defined in `infrastructure/cdk/lib/config/environment-schema.ts` and cost profiles.

## Out of scope (historical — Phase 2/3)

CAD operating modes (`CAD_ENABLED`, `HYBRID`) existed on tenant configuration enum without adapters through Phase 3.

## Phase 4 CAD flags

All default **false**. Enable only via tenant override for approved synthetic development tenants. API enforcement is required; UI gating alone is not sufficient.

| Flag key                                  | Gates                                                    |
| ----------------------------------------- | -------------------------------------------------------- |
| `rms.cad.enabled`                         | Master CAD API/UI switch                                 |
| `rms.cad.webhook.enabled`                 | Signed webhook intake                                    |
| `rms.cad.polling.enabled`                 | Polling adapters                                         |
| `rms.cad.hybrid.enabled`                  | HYBRID matching / manual linking                         |
| `rms.cad.operations.enabled`              | Operations dashboard and queue tools                     |
| `rms.cad.raw_payload_access.enabled`      | Restricted raw payload access (also requires permission) |
| `rms.cad.simulator.enabled`               | Synthetic simulator                                      |
| `platform.cad.adapter_management.enabled` | Creator Console adapter/mapping templates                |
