# Industrial E2E Journey Contracts (Model A)

Sprint: FORGE-INDUSTRIAL-MODEL-A-COMPLETION-S1  
These are explicit journey contracts for authenticated UAT in the next deploy sprint.

## PERSONNEL
1. Search roster via GET `/api/v1/industrial/personnel?q=`
2. Create via POST `/api/v1/industrial/personnel`
3. Open detail GET `/api/v1/industrial/personnel/:id` (includes training)
4. PATCH update fields
5. Archive/inactivate via status change

## TRAINING
1. List GET `/api/v1/industrial/training`
2. Bulk POST `/api/v1/industrial/training/bulk` with multiple `personnelIds`
3. Verify employee detail shows new training rows

## INCIDENT
1. Create POST `/api/v1/industrial/incidents`
2. List/filter by status
3. Detail GET `/api/v1/industrial/incidents/:id`
4. Transition close via POST `.../incidents/:id/close`
5. Link corrective action via `/api/v1/industrial/corrective-actions`

## INSPECTION
1. Create + list + detail
2. Transition complete
3. Attach corrective action (parentEntityType=INSPECTION)

## LOTO
1. Search procedures
2. Open detail (energy sources, isolation points, steps)
3. Printable HTML
4. Transition review/approve actions

## DOT
1. List/create `/api/v1/industrial/dot`
2. Filter by status; open detail

## WORKERS COMP
1. List cases (standard role — no medical)
2. Elevated medical role — GET case includes medical encounters
3. Standard role — medicalDeniedReason present; medical undefined

## ANALYTICS
1. GET `/api/v1/industrial/analytics/overview`
2. Confirm `model: MODEL_A`
3. Drilldown links open filtered modules

## MOBILE
1. Incident / observation / inspection create forms usable at 390px width
2. FilterPanel collapses to drawer
3. No horizontal overflow on ops tables (`.ind-ops-table-wrap`)
