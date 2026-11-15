# Import Platform — Access Control Matrix (S8)

**Document:** `docs/security/import-access-control-matrix.md`  
**Enforcement:** Platform API (`forgeAuth`) — UI matrix is advisory only  
**OpenAPI:** `docs/api/import-openapi.yaml` (`0.6.0-s6`)

## Permission catalog

| Permission               | Intent                                                |
| ------------------------ | ----------------------------------------------------- |
| `import.view`            | Read jobs, status, scan events, masked downloads      |
| `import.upload`          | Create upload sessions, complete/abort, some file ops |
| `import.map`             | Put/update column mappings                            |
| `import.validate`        | Validation requests, malware rescan                   |
| `import.preview`         | Preview generation / read                             |
| `import.approve`         | Submit / approve / reject                             |
| `import.execute`         | Execute import, cancel execution                      |
| `import.rollback`        | Rollback classification request                       |
| `import.profile.manage`  | Create/update/archive profiles                        |
| `import.template.manage` | Template management                                   |
| `import.error.reprocess` | Reprocess eligible row errors                         |
| `import.sensitive`       | Request privileged (still non-secret) downloads       |

## Capability matrix

| Capability                        | view | upload | map | validate | preview | approve | execute | rollback | profile.manage | template.manage | error.reprocess | sensitive |
| --------------------------------- | ---- | ------ | --- | -------- | ------- | ------- | ------- | -------- | -------------- | --------------- | --------------- | --------- |
| List/get jobs, status, results UI | ✓    |        |     |          |         |         |         |          |                |                 |                 |           |
| Masked artifact download          | ✓    |        |     |          |         |         |         |          |                |                 |                 |           |
| Privileged download flag          | ✓*   |        |     |          |         |         |         |          |                |                 |                 | ✓         |
| Upload initialize/complete/abort  |      | ✓      |     |          |         |         |         |          |                |                 |                 |           |
| Save mappings                     |      |        | ✓   |          |         |         |         |          |                |                 |                 |           |
| Validate / rescan                 |      |        |     | ✓        |         |         |         |          |                |                 |                 |           |
| Preview                           |      |        |     |          | ✓       |         |         |          |                |                 |                 |           |
| Approve / reject                  |      |        |     |          |         | ✓       |         |          |                |                 |                 |           |
| Execute / cancel                  |      |        |     |          |         |         | ✓       |          |                |                 |                 |           |
| Rollback request                  |      |        |     |          |         |         |         | ✓        |                |                 |                 |           |
| Manage profiles                   |      |        |     |          |         |         |         |          | ✓              |                 |                 |           |
| Manage templates                  |      |        |     |          |         |         |         |          |                | ✓               |                 |           |
| Reprocess errors                  |      |        |     |          |         |         |         |          |                |                 | ✓               |           |
| Malware override                  | —    | —      | —   | —        | —       | —       | —       | —        | —              | —               | —               | —         |
| Quarantine release                | —    | —      | —   | —        | —       | —       | —       | —        | —              | —               | —               | —         |
| Bypass Outcome B scanner block    | —    | —      | —   | —        | —       | —       | —       | —        | —              | —               | —               | —         |

\* Privileged download also requires `import.view` (or route’s view-equivalent) plus `import.sensitive` when `privileged=true`. Credentials remain non-returnable.

Some routes accept alternate permissions (e.g. certain file ops allow `import.upload` **or** `import.approve`). Treat OpenAPI `security` arrays as source of truth per operation.

## Role guidance (interim)

| Persona            | Typical grants                                     |
| ------------------ | -------------------------------------------------- |
| Tenant viewer      | `import.view`                                      |
| Tenant importer    | `view` + `upload` + `map` + `validate` + `preview` |
| Tenant approver    | above + `approve`                                  |
| Tenant executor    | above + `execute` (+ `rollback` if policy allows)  |
| Profile admin      | `profile.manage` (+ `view`)                        |
| Template admin     | `template.manage` (+ `view`)                       |
| Sensitive reviewer | `view` + `sensitive`                               |
| Support (read)     | `view` only — no execute/replay                    |

Exact role bindings live in platform RBAC seed data — keep this matrix aligned when roles change.

## Negative controls

| Action                                         | Result                                |
| ---------------------------------------------- | ------------------------------------- |
| Cross-tenant job id                            | RLS / not found — no leakage          |
| Execute without CLEAN gate                     | Denied / security hold                |
| Reference scanner in production-like `APP_ENV` | `IMPORT_SCANNER_PROVIDER_UNAVAILABLE` |
| Override infected                              | No endpoint                           |

## Test coverage

Executable checklist: `docs/imports/s8-permission-test-matrix.md`.
