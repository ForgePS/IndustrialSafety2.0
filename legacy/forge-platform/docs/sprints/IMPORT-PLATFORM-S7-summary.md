# Import Platform — Sprint S7 Summary

**Date:** 2026-07-29  
**Status:** **READY_FOR_REVIEW**  
**Do not start S8 until S7 is ACCEPTED.**

## Objectives

Shared Import Center UI for Creator Console and Tenant Admin, consuming existing
Import Platform APIs (OpenAPI `0.6.0-s6`). No product adapters, QR work, scanner
replacement, or Step Functions activation.

## Completed work

- Package `@forge/import-center` — API client, state router, permissions matrix,
  tenant cache, protected download helper, fixtures, badges, `ImportCenterApp`
- Routes: Creator Console + Tenant Admin `/imports/`
- Nav entries: Import Center
- Unit tests for router, permissions, filters, cache, fixtures, safe errors
- Architecture doc `IMPORT_CENTER_UI.md`

## Routes

| Path                     | Purpose                                                                                                                        |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `/imports/`              | Dashboard                                                                                                                      |
| `/imports/?view=new`     | New import + upload                                                                                                            |
| `/imports/?jobId=&view=` | State-driven workspace (security, mapping, validation, preview, duplicates, approval, execute, execution, results, quarantine) |

## Permission matrix

| Permission             | UI controls                            |
| ---------------------- | -------------------------------------- |
| import.view            | Dashboard, job views, masked downloads |
| import.upload          | New import / upload                    |
| import.map             | Mapping save                           |
| import.validate        | Validation request, rescan             |
| import.preview         | Preview request                        |
| import.approve         | Approve                                |
| import.execute         | Execute / cancel execution             |
| import.rollback        | Rollback request                       |
| import.profile.manage  | Profile admin affordances              |
| import.template.manage | Template admin affordances             |
| import.error.reprocess | Error retry                            |
| import.sensitive       | Privileged download request            |

## Design decisions

- Shared package used by both apps (no product forks)
- Query-param job workspace for static export compatibility
- No override control (S6 reserved)
- Rollback wording: classification request only

## Known limitations

| Limitation                 | Impact                                     | Mitigation                    | Future                         |
| -------------------------- | ------------------------------------------ | ----------------------------- | ------------------------------ |
| reference-malware@1        | Not production-ready for untrusted imports | Dev/test only; fail-closed    | Separate scanner authorization |
| SF inactive                | Worker path only                           | API+worker gates              | Separate activation            |
| No product field catalogs  | Generic product/module/record keys         | Server config when available  | Adapters (later)               |
| Polling monitor            | No push updates                            | 3s poll with stop on terminal | S8 optional                    |
| Full rollback compensation | Not executed                               | Accurate UI wording           | Later sprint                   |
| Narrow phone mapping       | Limited                                    | Desktop/tablet first          | Later                          |

## Recommendation for S8

Production hardening, Aurora-scale testing, scanner-provider replacement (authorized separately), and optional real-time monitor — not adapters/QR unless separately authorized.

## Deployment

See docs/deployment/import-platform-s7-deployment.md.

Status: COMPLETE (frontend static sync)
Console: s3 sync + CloudFront EUY00O1FSF7BG / IMLMHCLH1MMHB1G6F5Y5LB2JZ
Tenant Admin: s3 sync + CloudFront E3O4NP8GCEEK23 / I4EBJJB26ECNZTFXJJ67Z9FWCN
Smoke: /imports/ present in both out/ folders
Backend API/worker TDs: unchanged :39 / :24
App secret LastChangedDate: unchanged 2026-07-26T15:30:16.387000-05:00
