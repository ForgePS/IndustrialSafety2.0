# 01 — Module Inventory

**Date:** 2026-07-30  
**Source:** Verified routes in `apps/rms-web`

| Module              | Live routes                                          | S2F phase | Disposition                |
| ------------------- | ---------------------------------------------------- | --------- | -------------------------- |
| Incidents           | `/incidents/`, `/incidents/new/`, `/incidents/[id]/` | S2F-1     | **Accepted / checkpoint**  |
| Incident Review     | `/review/`, incident `?section=REVIEW`               | S2F-2     | Checkpoint                 |
| CAD Messages        | `/cad/messages/`                                     | S2F-3     | Accepted / checkpoint      |
| CAD Connections     | `/cad/connections/`                                  | S2F-4     | Accepted (with conditions) |
| CAD Conflicts       | `/cad/conflicts/`                                    | S2F-5     | Accepted / checkpoint      |
| NERIS Configuration | `/configuration/`                                    | S2F-6     | Accepted / checkpoint      |
| Administration      | `/select-tenant/`                                    | S2F-7     | Accepted / checkpoint      |
| Utilities           | `/health/`                                           | S2F-7     | Accepted / checkpoint      |

## Not in live rms-web (do not invent)

Personnel, Training, Scheduling, Fleet, Apparatus, Prevention, Inspections, Hydrants, Preplans, Occupancies, EMS, Inventory, Daily Log.
