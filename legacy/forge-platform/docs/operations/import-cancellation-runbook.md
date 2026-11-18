# Import Cancellation Runbook (S5)

## QUEUED

`POST /api/v1/imports/jobs/{id}/cancel` with `import.execute` transitions to `CANCELLED` immediately.

## PROCESSING

Sets `cancellationRequested=true`. Worker stops at safe checkpoint (between records), marks remaining staged rows cancelled where applicable, finalizes partial results, status `CANCELLED`.

Cancellation is idempotent.
