# S2F-7 Administration & Utilities — Test Plan

## Automated

| Suite                  | Coverage                                            |
| ---------------------- | --------------------------------------------------- |
| `module-flags.test.ts` | administration ∧ tables; utilities module-only      |
| E2E scaffold           | Module off → legacy; admin+tables / utilities smoke |

## Manual / pilot

Select tenant (multi-tenant account) · non-selectable rows · unauthenticated select-tenant · health success/failure · independent admin/utilities rollback · login still legacy · mixed-mode with all prior S2F modules.
