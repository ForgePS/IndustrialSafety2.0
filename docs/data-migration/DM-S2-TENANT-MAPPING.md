# DM-S2 Tenant Mapping

| SOURCE                   | CLASSIFICATION                | AWS TENANT                                                     |
| ------------------------ | ----------------------------- | -------------------------------------------------------------- |
| `business-1782553339499` | CUSTOMER                      | `5da680d3-50f5-46ac-8b85-6cf454b6a0da` (`producers-rice-mill`) |
| `business-forge-default` | PLATFORM_DEFAULT              | not customer import                                            |
| `GLOBAL`                 | GLOBAL_TEMPLATE               | platform templates only                                        |
| `Producers Rice Mill`    | LEGACY_ALIAS (approved remap) | same as CUSTOMER above                                         |

Code: `tools/data-migration/transformer/src/tenant-map.ts`

Organizations / platformBusinesses documents use **document id** as the source tenant key when extract metadata has null `sourceTenantKey`.
