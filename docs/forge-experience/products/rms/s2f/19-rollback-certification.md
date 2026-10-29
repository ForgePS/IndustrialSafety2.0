# 19 — Rollback Certification (S2F-8)

**Date:** 2026-07-31  
**Status:** **CERTIFIED BY DESIGN + UNIT TESTS** (live toggle evidence pending pilot)

## Per-module rollback

| Module flag                 | Restores                               | Does not affect                          |
| --------------------------- | -------------------------------------- | ---------------------------------------- |
| `module.incidents`          | Legacy list / new / workspace          | Other modules, shell, nav, foundations   |
| `module.incidentReview`     | Legacy review queue / officer forms    | Incidents module, specialty legacy panel |
| `module.cadMessages`        | Legacy messages table                  | Other CAD modules                        |
| `module.cadConnections`     | Legacy create form + connections table | Other CAD modules                        |
| `module.cadConflicts`       | Legacy conflicts table                 | Other CAD modules                        |
| `module.nerisConfiguration` | Legacy configuration forms             | Other modules                            |
| `module.administration`     | Legacy select-tenant table             | Utilities                                |
| `module.utilities`          | Legacy health panel                    | Administration                           |

## Procedure

1. Set target module flag = false (tenant override / seed default).
2. Clear matching `NEXT_PUBLIC_*` and `sessionStorage` override.
3. Refresh route — legacy markup path renders.
4. Confirm other module FX surfaces (if enabled) still resolve independently.

## Certification statement

Independent module rollback is enforced by resolvers (`module-off` reasons) covered in `module-flags.test.ts`. Live pilot should capture before/after screenshots per module as evidence attachments.
