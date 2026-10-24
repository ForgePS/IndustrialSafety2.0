# Regression Plan — FX-S2

**Document:** `17-regression-plan.md`  
**Status:** ACTIVE (S2E)

## Existing automated suites

`apps/rms-web-e2e/tests/` — NERIS/CAD/auth/a11y/mobile (unchanged).

## S2B–S2E additions

| Suite                                        | Location                                                   |
| -------------------------------------------- | ---------------------------------------------------------- |
| Flag resolver unit                           | `src/fx/flags/rms-fx-flags.test.ts`                        |
| Nav registry/adapter unit                    | `src/fx/navigation/navigation.adapter.test.ts`             |
| Breadcrumb unit                              | `src/fx/breadcrumbs/breadcrumb.adapter.test.ts`            |
| Dashboard / workspace / forms / tables flags | `src/fx/**/**-flags.test.ts`                               |
| Form/table registries                        | `src/fx/forms`, `src/fx/tables`                            |
| Playwright FX matrix                         | `apps/rms-web-e2e/tests/fx-s2-regression.scaffold.spec.ts` |

## Manual

Role matrix, tablet drawer, rollback from deep links, legacy vs FX comparison when flags forced on locally. Forms/tables: validation, sort/filter, selection, responsive.
