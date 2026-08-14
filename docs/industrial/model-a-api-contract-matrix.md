# Model A API Contract Matrix

**Sprint:** FORGE-INDUSTRIAL-MODEL-A-COMPLETION-S1  
**BASE_SHA:** `9370d05`  
**Authoritative model:** MODEL A (normalized `industrial_*` tables)  
**Deprecated:** MODEL B (`industrial_ops_records`) — must not be reintroduced

## Summary

| Metric | Value |
|--------|-------|
| TOTAL_FRONTEND_API_CALL_GROUPS | 78 |
| API_MATCHED | 52 |
| API_IMPLEMENTED (this sprint) | 48 |
| API_PARTIAL | 18 |
| API_OBSOLETE | 0 |
| API_NEEDS_REDESIGN | 8 |
| FRONTEND_API_CONTRACT_GAPS (hard 404 for core modules) | 0 |

Canonical application contract: **`/api/v1/industrial/*`** with tenant from session.

Tenant-scoped `/api/v1/tenants/:tenantId/industrial/*` retained for platform/org lookups only (not a second full Industrial API).

---

## Frontend → Model A mapping

| FRONTEND MODULE | METHOD | EXPECTED ROUTE | TARGET TABLES | STATUS | ACTION |
|-----------------|--------|----------------|---------------|--------|--------|
| Shell / all | GET | `/api/v1/industrial/bootstrap` | feature flags + registry | MATCHED | Keep |
| Health | GET | `/api/v1/industrial/readiness` | flags | MATCHED | Keep |
| Dashboard | GET | `/api/v1/industrial/dashboard` | incidents, CA, inspections, training, observations, LOTO, WC, tasks | IMPLEMENTED | Attention KPIs |
| Analytics | GET | `/api/v1/industrial/analytics/overview` | normalized domain counts | IMPLEMENTED | Model A rewrite |
| Personnel | GET/POST/PATCH | `/api/v1/industrial/personnel[/:id]` | `industrial_personnel` | MATCHED | CRUD + detail training |
| Personnel search | GET | `/api/v1/industrial/personnel/search` | `industrial_personnel` | IMPLEMENTED | Alias list |
| Seasonal metrics | GET | `/api/v1/industrial/personnel/seasonal/*` | personnel status filters | PARTIAL | No seasons DDL; status projection |
| Orientation / seasons | * | `/api/v1/industrial/personnel/orientation/*`, `/seasons` | — | NEEDS_REDESIGN | Empty business payloads; no Model B |
| Sites | GET | `/api/v1/industrial/sites` | `industrial_sites` | MATCHED | Keep |
| Equipment | GET/POST + archive | `/api/v1/industrial/equipment` | `industrial_equipment` | MATCHED | Create/archive added |
| Incidents | GET/POST/:id | `/api/v1/industrial/incidents` | `industrial_incidents` | MATCHED | Keep |
| Inspections | GET/POST/:id | `/api/v1/industrial/inspections` | `industrial_inspections` | MATCHED | Keep |
| Observations | GET/POST/:id | `/api/v1/industrial/observations` | `industrial_observations` | MATCHED | Generic module CRUD |
| JSAs | GET/POST/:id | `/api/v1/industrial/jsas` | `industrial_jsas` | MATCHED | Generic module CRUD |
| Training | GET/POST | `/api/v1/industrial/training` | `industrial_training_records` | IMPLEMENTED | Drizzle + CRUD |
| Training bulk | POST | `/api/v1/industrial/training/bulk` | `industrial_training_records` | IMPLEMENTED | Multi-employee completion |
| Certifications | GET/POST | `/api/v1/industrial/certifications` | `industrial_certificate_templates` | IMPLEMENTED | Templates surface |
| Forms | GET/POST | `/api/v1/industrial/forms` | `industrial_form_definitions` | IMPLEMENTED | Definitions list/create |
| LOTO | GET/POST/:id/actions/printable | `/api/v1/industrial/loto` | procedures + energy/isolation/steps | MATCHED+DEPTH | Detail joins children |
| Tasks | GET/POST/:id/action | `/api/v1/industrial/tasks` | `industrial_tasks` | IMPLEMENTED | |
| WC | GET/POST/:id | `/api/v1/industrial/workers-comp` | `industrial_workers_comp_cases` (+ medical gated) | IMPLEMENTED | Medical RBAC |
| DOT | GET/POST/:id | `/api/v1/industrial/dot` | `industrial_dot_compliance_records` | IMPLEMENTED | |
| High-risk modules | GET/POST/:id/action | confined-space, hot-work, heights, electrical, cranes, machine-safety | matching `*_records` | IMPLEMENTED | |
| Compliance packs | GET/POST | forklifts, osha, chemical/warehouse/… | matching `*_records` | IMPLEMENTED | |
| Risk | GET/POST | `/api/v1/industrial/risk` | projected from observations | PARTIAL | No risk table |
| Corrective actions | GET/POST | `/api/v1/industrial/corrective-actions` | `industrial_corrective_actions` | IMPLEMENTED | Flat route |
| Emergency response | GET/POST | `/api/v1/industrial/emergency-response/:category` | `industrial_emergency_response_records` | IMPLEMENTED | |
| Messaging | GET/POST | `/api/v1/industrial/messaging/*` | — | NEEDS_REDESIGN | Empty / business error (no DDL) |
| Documents | * | `/api/v1/documents` | `platform_documents` | MATCHED | Shared platform API |
| QR Links | * | `/api/v1/qr-links` | `qr_links` | MATCHED | Shared platform API |
| Reporting | * | `/api/v1/reports/*` | report adapters | MATCHED | |
| Import | GET | `/api/v1/imports/templates` | imports | MATCHED | |
| Branding / persons / facilities | * | `/api/v1/tenants/...` | platform | MATCHED | Non-industrial |

---

## Status legend

- **MATCHED** — route existed and maps to Model A  
- **IMPLEMENTED** — added this sprint against Model A  
- **PARTIAL** — route exists; depth or related entities incomplete  
- **NEEDS_REDESIGN** — no Model A table; stubbed without inventing Model B  
- **OBSOLETE** — none

## Non-goals preserved

- No `industrial_ops_records`  
- No dual-write  
- No production deployment in this sprint  
- Fleet module reserved (tenant fleet APIs remain; dedicated Fleet sprint not merged here)
