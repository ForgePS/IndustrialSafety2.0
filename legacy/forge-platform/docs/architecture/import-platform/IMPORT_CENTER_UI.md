# Import Center — User Architecture (S7)

## Surfaces

| App             | Route       | Audience              |
| --------------- | ----------- | --------------------- |
| Creator Console | `/imports/` | Platform operators    |
| Tenant Admin    | `/imports/` | Tenant administrators |

Shared UI lives in `@forge/import-center`. Product apps (RMS/Academy) do not host the shared center.

## Routing (static export)

Query-param workspace (repository convention for `output: "export"`):

- `/imports/` — dashboard
- `/imports/?view=new` — new import
- `/imports/?jobId={id}&view={step}` — job workspace

State-driven view resolution uses server job status via `resolveImportWorkflowView`.

## Permissions

See `IMPORT_PERMISSION_MATRIX` in `@forge/import-center`. Hidden controls are not security enforcement.

## Security UX

- No malware override control
- Quarantine blocks mapping/approval/execute/download
- Masked values by default; privileged downloads require `import.sensitive`
- Presigned URLs are never logged or persisted
- Tenant switch clears in-memory import cache

## Limitations

- Reference malware provider remains development/test only
- Full rollback compensation not available (request classification only)
- Step Functions not activated
- Product-specific field catalogs await adapters
- Polling used for execution monitor (no WebSockets)
