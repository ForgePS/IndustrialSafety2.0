# DM-S0 Tenant Ownership

**Source project:** `forge-industrial-safety`  
**Rule:** Do not guess tenant ownership. Flag ambiguity.

## How tenant scoping works

Observed mechanisms (often combined on the same document):

| Mechanism          | Fields / path                               | Prevalence                       |
| ------------------ | ------------------------------------------- | -------------------------------- |
| Business id        | `businessId`                                | Dominant on operational modules  |
| Organization id    | `organizationId`                            | Sites, departments, many modules |
| Company id         | `companyId`                                 | Personnel/assets/safety modules  |
| Explicit tenant id | `tenantId`                                  | Some LOTO families               |
| Parent path        | Storage paths `…/{businessId}/…`            | Files                            |
| Auth claims        | `businessIds` / `businessId` / `businesses` | Firebase Auth                    |

There is **no single universal key**. DM-S1 must implement a precedence policy, recommended:

1. `businessId` when present and `business-*`
2. else map `organizationId` via `organizations` / `platformBusinesses`
3. else `companyId` if unambiguously mapped
4. else quarantine

## Distinct source tenant keys observed

| SOURCE_TENANT_ID         | Collections present (count of collections where key appeared) | Classification                                                    |
| ------------------------ | ------------------------------------------------------------- | ----------------------------------------------------------------- |
| `business-1782553339499` | 71                                                            | Primary customer business (Producers)                             |
| `business-forge-default` | 25                                                            | Platform/default business                                         |
| `GLOBAL`                 | 2 (`ehsAuditTemplates`, `ehsAuditTemplateVersions`)           | Shared/global template scope — **AMBIGUOUS for customer tenancy** |
| `Producers Rice Mill`    | 1 (`auth_audit_logs`)                                         | Display-name used as id — **AMBIGUOUS / HIGH**                    |

## Per-collection ownership (summary)

| COLLECTION class                                                                                     | TENANT_SCOPING_METHOD                                | UNSCOPED_RECORDS       | AMBIGUOUS_RECORDS                     | NOTES                                       |
| ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ---------------------- | ------------------------------------- | ------------------------------------------- |
| Operational industrial modules (personnel, assets, LOTO, safety modules, WC, QR, training, forms, …) | Field `businessId` (+ often org/company)             | 0 observed in samples  | Possible mixed keys                   | Migrate filtered by authorized business ids |
| `sites`, `departments`                                                                               | `organizationId`                                     | 0                      | Org→business map required             | Facility inventory uses `sites`             |
| `organizations`, `platformBusinesses`                                                                | Registry / platform                                  | N/A (are the registry) | —                                     | Not “customer orphans”                      |
| `platformSettings`, `super_admins`, billing templates                                                | Platform                                             | Platform-scoped        | —                                     | Not customer tenant data                    |
| `content_overrides`                                                                                  | No tenant key in sample                              | 3 docs                 | Treat as platform/global until proven | Review before load                          |
| `auth_audit_logs`                                                                                    | mostly `organizationId`; one display-name businessId | —                      | **yes** (`Producers Rice Mill`)       | Normalize before import                     |
| EHS audit templates with `GLOBAL`                                                                    | Literal `GLOBAL` businessId                          | —                      | **yes**                               | Shared library vs tenant copy decision      |

## Facilities / locations

| Source        | Count | Tenant link      | Notes                         |
| ------------- | ----- | ---------------- | ----------------------------- |
| `sites`       | 27    | `organizationId` | Primary facility/site records |
| `departments` | 88    | `organizationId` | Areas/departments under org   |

No separate root `facilities` / `plants` collection observed. Target mapping likely `sites` → facilities/sites; `departments` → areas/organizations.

## Migration blockers (ownership)

| ID    | Severity | Issue                                                                                     |
| ----- | -------- | ----------------------------------------------------------------------------------------- |
| OWN-1 | HIGH     | `businessId = "Producers Rice Mill"` on some `auth_audit_logs` (non-canonical id)         |
| OWN-2 | MEDIUM   | `businessId = "GLOBAL"` on EHS audit template collections                                 |
| OWN-3 | MEDIUM   | Dual keys (`businessId` vs `organizationId`-only on sites/departments) require join table |
| OWN-4 | INFO     | Auth users (10) << personnelRecords (1097) — membership migration is not 1:1 with Auth    |

No large unscoped customer operational collections were found without any tenant-like field in samples. Platform/registry collections are intentionally unscoped.
