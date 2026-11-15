# Import Retry and DLQ Runbook (S5)

## Retries

- Visibility timeout + receive count (queue maxReceiveCount = 3)
- RETRIABLE failures return message to queue via shortened visibility
- Exhausted retries land on imports DLQ

## DLQ

1. Inspect message attributes (`tenantId`, `correlationId`, `messageType`) — never expect raw row data
2. Confirm job state in PostgreSQL
3. Fix root cause
4. Authorized operator redrive only — never auto-redrive

## Alerts

Existing monitoring alarms cover imports backlog and DLQ depth.
