# FX-S1 Reference Documentation

**Phase:** FX-S1  
**Status:** IN PROGRESS → packages + reference app scaffolded  
**Last Updated:** 2026-07-30

## What was built

| Path                              | Role                                                |
| --------------------------------- | --------------------------------------------------- |
| `apps/forge-experience-reference` | Living reference app (port 3010)                    |
| `packages/fx-design-tokens`       | Token CSS + theme helpers                           |
| `packages/fx-ui`                  | Shared UI primitives                                |
| `packages/fx-layouts`             | Shell, dashboard, workspace layouts                 |
| `packages/fx-hooks`               | Theme, responsive, selection, dialogs, offline demo |
| `packages/fx-icons`               | Minimal icons                                       |
| `packages/fx-patterns`            | Create/Delete patterns                              |
| `packages/fx-utils`               | `cn` helper                                         |
| `storybook/`                      | Storybook placeholder config                        |
| `docs/forge-experience/39–42`     | Governance, readiness, gaps, migration              |

## Run locally

```bash
pnpm install
pnpm --filter @forge/fx-design-tokens build
pnpm --filter @forge/fx-utils build
pnpm --filter @forge/fx-icons build
pnpm --filter @forge/fx-ui build
pnpm --filter @forge/fx-hooks build
pnpm --filter @forge/fx-layouts build
pnpm --filter @forge/fx-patterns build
pnpm --filter @forge/forge-experience-reference dev
```

Open `http://localhost:3010`.

## Guarantees

- No modifications to RMS, Academy, Industrial, Creator Console, Tenant Admin, APIs, auth, DBs, or infrastructure as part of FX-S1 scaffolding.

## Validation logs

- [a11y-validation-log.md](./a11y-validation-log.md)
- [responsive-validation-log.md](./responsive-validation-log.md)
- [theme-validation-log.md](./theme-validation-log.md)
