# Import Platform — UI Architecture (S8)

**Document:** `docs/architecture/import-ui.md`  
**Package:** `@forge/import-center`  
**Surfaces:** Creator Console + Tenant Admin `/imports/`

## Design

Shared Import Center consumes Import Platform APIs (OpenAPI `0.6.0-s6`). No product-specific UI forks. No product field catalogs (generic keys only).

## Routing (static export)

| Path                     | Purpose                |
| ------------------------ | ---------------------- |
| `/imports/`              | Dashboard              |
| `/imports/?view=new`     | New import + upload    |
| `/imports/?jobId=&view=` | State-driven workspace |

Views include: security, mapping, validation, preview, duplicates, approval, execute, execution, results, quarantine, profiles, templates.

`resolveImportWorkflowView` maps server job status → allowed view. Query-param workspace matches `output: "export"` apps.

## Permissions (UI)

UI hides/disables controls via `IMPORT_PERMISSION_MATRIX`. **UI is not the enforcement boundary** — API still authorizes.

| Permission               | Controls                               |
| ------------------------ | -------------------------------------- |
| `import.view`            | Dashboard, job views, masked downloads |
| `import.upload`          | New import / upload / abort            |
| `import.map`             | Mapping save                           |
| `import.validate`        | Validation, rescan                     |
| `import.preview`         | Preview request                        |
| `import.approve`         | Approve / reject                       |
| `import.execute`         | Execute / cancel                       |
| `import.rollback`        | Rollback classification request        |
| `import.profile.manage`  | Profile admin                          |
| `import.template.manage` | Template admin                         |
| `import.error.reprocess` | Error retry                            |
| `import.sensitive`       | Privileged download request            |

## Security UX

- States Outcome B restriction: production-like imports blocked without production scanner.
- No malware override control.
- Quarantine view without release button.
- Rollback copy: classification request only.
- Tenant switch clears in-memory import cache (`clearImportTenantCache`).
- Protected downloads dispose object URLs; do not log/persist presigns.

## Execution monitor

Polls job status every **~3 seconds**; stops on terminal states. No WebSocket/SSE (LIM-IMP-005).

## Accessibility & responsive (S8 honesty)

| Area                                      | Status                                                                                           |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Semantic headings/labels                  | Present in panels (code-level)                                                                   |
| Playwright / axe suite                    | **Not greenfield-complete** — requirements in `docs/testing/import-platform-s8-accessibility.md` |
| Narrow phone mapping                      | Limited (LIM-IMP-008); desktop/tablet first                                                      |
| Browser tenant-switch / download evidence | Still needed (LIM-IMP-012/013/014)                                                               |

## Related

- S7 detail: `docs/architecture/import-platform/IMPORT_CENTER_UI.md`
- User guide: `docs/user-guides/import-center.md`
- A11y test plan: `docs/testing/import-platform-s8-accessibility.md`
