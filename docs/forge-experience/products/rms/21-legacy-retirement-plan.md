# Legacy Retirement Plan — FX RMS

**Document:** `21-legacy-retirement-plan.md`  
**Status:** FRAMEWORK (S2A)

## Retirement conditions

Replacement accepted · production stability · no unresolved critical defects · telemetry reviewed · roles validated · rollback window completed · dependencies removed · docs updated · formal approval.

## Rules

- Mark deprecated before deletion.
- Do not delete in the same change that first enables replacement.
- Current retirement candidates (future): `app-shell.tsx` CSS modules, `@forge/ui` EnvironmentBanner usage, parallel design-system CSS once FX tokens sole source.

## Outside monorepo

Legacy Firebase RMS retirement is a separate program track; not authorized by FX-S2A.
