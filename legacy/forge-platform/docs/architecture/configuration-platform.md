# Configuration Platform Architecture

**Status:** Product foundation complete (acceptance with limitations)  
**Canonical roadmap:** Phase 8 Configuration Studio  
**Master Directive name:** Configuration Platform (do not confuse with roadmap Phase 4 Person Registry or NERIS Phase 4 CAD)

## Kernel

- Package: `@forge/configuration`
- Tables: `config_objects`, `config_versions` (migration `0021`)
- Lifecycle: DRAFT → SCHEDULED | PUBLISHED → SUPERSEDED | ARCHIVED
- Rollback: clone prior payload → new DRAFT → PUBLISH
- Effective: published (or due scheduled) by `effective_from` / `effective_to`

## Surfaces

| App                       | Role                                                 |
| ------------------------- | ---------------------------------------------------- |
| Creator Console `/studio` | Full admin (27 modules)                              |
| Tenant Admin `/studio`    | Delegated (13 modules)                               |
| RMS                       | Consumes terminology + dropdowns (+ navigation hook) |

## API

Under `api/v1/tenants/:tenantId/config/...` plus `api/v1/config/catalog`, `config-export`, `config-import`.

## Security

RLS FORCE on config tables; namespace allowlist for Tenant Admin; audit on lifecycle mutations.
