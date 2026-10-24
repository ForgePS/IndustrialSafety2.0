# DM-S1 Tenant Mapping Contract

**Source project:** `forge-industrial-safety`  
**Rule:** Extractor records `sourceTenantKey` + classification. It does **not** rewrite aliases into AWS tenant IDs.

## Known source keys

| SOURCE_TENANT_KEY        | CLASSIFICATION   | CANONICAL_TENANT_KEY           | EVIDENCE                                                                                                                 | DISPOSITION                                                                  |
| ------------------------ | ---------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| `business-1782553339499` | CUSTOMER         | `business-1782553339499`       | `organizations/{id}` and `platformBusinesses/{id}` exist; Auth claims include this id; dominant operational `businessId` | Map later to AWS `tenants` via explicit mapping table                        |
| `business-forge-default` | PLATFORM_DEFAULT | `business-forge-default`       | Platform default registry business                                                                                       | Do not treat as Producers customer tenant                                    |
| `GLOBAL`                 | GLOBAL_TEMPLATE  | `null` (no customer canonical) | `ehsAuditTemplates` / versions with `isForgeDefault` / `allowTenantCopy`                                                 | PLATFORM_GLOBAL — never copy into arbitrary customer tenant                  |
| `Producers Rice Mill`    | LEGACY_ALIAS     | `null` (do not auto-map)       | DM-S0 observed as `businessId` on `auth_audit_logs`; **not** an `organizations` document id                              | Quarantine until manual approval maps to `business-1782553339499` or EXCLUDE |

## Is `businessId="Producers Rice Mill"` a tenant id?

**No — treat as LEGACY_ALIAS / display-name string.**

Evidence:

1. Canonical org/business document ids are `business-*` strings.
2. `"Producers Rice Mill"` matches the customer display name, not the registry document id.
3. Auto-normalization would invent a mapping without a hard join key.

DM-S1 extraction preserves the raw string in `_migration.sourceTenantKey` and sets `canonicalTenantKey: null`.

## Precedence for picking source tenant key (extractor)

1. `businessId` if non-empty string
2. else `organizationId`
3. else `companyId`
4. else `tenantId`
5. else `null` → classification UNKNOWN

Sites/departments often use `organizationId` only — join to `organizations` / `platformBusinesses` is required in a later transform sprint (DM-S2+), not in DM-S1.

## Ambiguous tenant records policy

| Class            | Action in DM-S1                 | Action before AWS import                |
| ---------------- | ------------------------------- | --------------------------------------- |
| CUSTOMER         | Extract with canonical = source | Mapping table → AWS UUID                |
| PLATFORM_DEFAULT | Extract; flag platform          | Usually EXCLUDE or platform tenant only |
| GLOBAL_TEMPLATE  | Extract; canonical null         | PLATFORM_GLOBAL disposition             |
| LEGACY_ALIAS     | Extract; canonical null         | Manual map or EXCLUDE_WITH_APPROVAL     |
| UNKNOWN          | Extract; warn                   | Quarantine                              |

## Implementation

`tools/data-migration/firebase-extractor/src/tenant-mapping.ts`
