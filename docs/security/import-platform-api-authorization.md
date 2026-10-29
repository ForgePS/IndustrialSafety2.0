# Import Platform API Authorization (S2)

## Permission map

| Capability                                    | Permission                              |
| --------------------------------------------- | --------------------------------------- |
| List/read jobs, mappings, profiles, templates | `import.view`                           |
| Create/patch jobs                             | `import.upload`                         |
| Replace/delete mappings                       | `import.map`                            |
| Request validation                            | `import.validate`                       |
| Request preview / submit for approval         | `import.preview`                        |
| Approve / reject                              | `import.approve`                        |
| Cancel (pre-execution)                        | `import.upload` **or** `import.approve` |
| Profile CRUD / archive / restore              | `import.profile.manage`                 |

`import.execute`, `import.rollback`, `import.template.manage`, `import.error.reprocess`, and `import.sensitive` are seeded but not exercised by S2 route handlers (deferred).

## Enforcement

- Nest `@RequirePermission` / `@RequireAnyPermission` on every import route
- No frontend-only authorization
- Tenant admin seed still excludes Creator-only platform privileges; import codes remain unscoped `import.*`

## Entitlement

Create job/profile requires ACTIVE tenant entitlement for the requested product + module.

## Tenant isolation

All DB work uses `withTenantTransaction`. Cross-tenant UUID access returns `IMPORT_*_NOT_FOUND` (404) without metadata leakage.
