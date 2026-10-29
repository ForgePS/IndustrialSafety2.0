# 01 — GA Deployment Plan

**Phase:** FX-P2  
**Status:** **DRAFT — NOT AUTHORIZED FOR EXECUTION**  
**Prerequisite:** Pilot closeout = `READY FOR GENERAL AVAILABILITY` + executive approval

## Principles

1. Global defaults stay **false** until an explicit GA enablement decision.
2. Prefer staged cohort enablement (tenant overrides) before any seed/default change.
3. Preserve legacy paths until a later legacy-retirement program (not FX-P2).
4. Wave order matches pilot (do not reorder without approval).
5. CAD Connections last (Wave 8) and only after S2F-4 conditions closed in pilot.

## Recommended GA sequence (post-pilot)

| Stage | Action                                                                         |
| ----- | ------------------------------------------------------------------------------ |
| G0    | Freeze pilot evidence; exec sign-off                                           |
| G1    | Expand tenant overrides to approved cohort(s) — still no global default change |
| G2    | Optional: set selected `fx.rms.*` defaults true **only** with formal approval  |
| G3    | Hypercare (support + monitoring)                                               |
| G4    | Legacy retirement — **separate program; not in FX-P2**                         |

## Wave content (same as pilot)

| Wave | Enable                                                 |
| ---- | ------------------------------------------------------ |
| 1    | Shell, Navigation, Workspace, Forms, Tables, Incidents |
| 2    | Incident Review                                        |
| 3    | CAD Messages                                           |
| 4    | CAD Conflicts                                          |
| 5    | NERIS Configuration                                    |
| 6    | Administration                                         |
| 7    | Utilities                                              |
| 8    | CAD Connections                                        |

## Explicitly not part of this plan

- Building new features
- Removing compatibility layers
- Global enable without pilot success
- Multi-tenant pilot expansion without authorization
