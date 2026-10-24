# Decision Register — FX-S2 RMS

**Document:** `23-decision-register.md`  
**Updated:** 2026-07-30

| ID          | Decision                                          | Status                           | Notes                                                                                                                                                                                                                                                                              |
| ----------- | ------------------------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DEC-S2-001  | FX-S2A inventory based on monorepo `rms-web` only | Accepted                         | Legacy Firebase surfaces tracked as gaps                                                                                                                                                                                                                                           |
| DEC-S2-002  | No visible production UI changes in S2A           | Accepted                         | Docs + test scaffold only                                                                                                                                                                                                                                                          |
| DEC-S2-003  | FX flags additive; product flags unchanged        | Proposed                         | See `18-feature-flag-plan.md`                                                                                                                                                                                                                                                      |
| DEC-S2-004  | First FX workspace: Incident vs Personnel         | **Needs product owner**          | Personnel UI absent; see `09`                                                                                                                                                                                                                                                      |
| DEC-S2-005  | Navigation source of truth                        | **Accepted — Controlled Hybrid** | Typed route registry authoritative for path/id/permissions/product flags/deep links; Config Studio may later control labels/grouping/order/visibility only when validated. Hardcoded groups replaced by registry mirroring live routes. See `evidence/s2b/decisions/DEC-S2-005.md` |
| DEC-S2-006  | Recommend APPROVE FX-S2B after S2A review         | Pending                          | Completion report                                                                                                                                                                                                                                                                  |
| DEC-S2F-001 | Begin S2F-1 Incidents only                        | Accepted                         | See `s2f/13-decision-register.md`                                                                                                                                                                                                                                                  |
| DEC-S2F-002 | Incident FX = module ∧ foundation                 | Accepted                         | Safe legacy otherwise                                                                                                                                                                                                                                                              |
| DEC-S2F-003 | Continuous S2F-2+                                 | Superseded by DEC-S2F-005        | S2F-2 authorized                                                                                                                                                                                                                                                                   |
| DEC-S2F-005 | Begin S2F-2 Incident Review                       | Accepted                         | See `s2f/13-decision-register.md`                                                                                                                                                                                                                                                  |
| DEC-S2F-007 | Begin S2F-3 CAD Messages                          | Accepted                         | See `s2f/13-decision-register.md`                                                                                                                                                                                                                                                  |

## Compatibility adapter decisions (design)

| Adapter                  | Responsibility                                |
| ------------------------ | --------------------------------------------- |
| `RmsFxFlagBridge`        | Map platform flags → FX presentation booleans |
| `RmsNavAdapter`          | Emit FX nav items from current groups + flags |
| `RmsAuthSessionAdapter`  | Pass-through web-kit session to shell slots   |
| `RmsListControlsAdapter` | Bridge ListControlsView → FX table gradually  |
| `RmsFeatureGateChrome`   | FX empty/alert when flag off                  |

Adapters are **designed** in S2A; implementation begins S2B+.
