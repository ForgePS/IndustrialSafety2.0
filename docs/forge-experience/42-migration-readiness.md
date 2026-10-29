# FX Migration Readiness

**Document:** `42-migration-readiness.md`  
**Phase:** FX-S2A  
**Status:** FX-S1.5 approved · FX-S2A inventory complete · FX-S2B pending approval  
**Last Updated:** 2026-07-30

## Purpose

Track readiness to migrate Forge RMS onto Forge Experience RC1.

## Gate status

| Gate                             | Status                                        |
| -------------------------------- | --------------------------------------------- |
| FX-S0 / S1 / S1.5                | Complete / approved per program authorization |
| FX-S2A Inventory & Compatibility | **Complete — awaiting formal approval**       |
| FX-S2B Shell & Navigation        | **Blocked** until S2A report approved         |

## S2A package

See [products/rms/](./products/rms/) and [products/rms/evidence/FX-S2A-completion-report.md](./products/rms/evidence/FX-S2A-completion-report.md).

## Risks

Program: [34-risk-register.md](./34-risk-register.md) · RMS: [products/rms/22-risk-register.md](./products/rms/22-risk-register.md)

## Required for S2B (after approval)

- Introduce `@forge/fx-*` into `apps/rms-web` behind flags
- Implement compatibility adapters (designed in S2A)
- Dual path: legacy shell when FX flags off

## Stop conditions

Do not weaken authZ, change NERIS logic, or invent unscoped module UIs. Stop if platform stabilization gates prohibit work.
