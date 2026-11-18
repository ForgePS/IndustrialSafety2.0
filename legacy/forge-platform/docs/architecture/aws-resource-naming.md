# AWS resource naming

Format: `forge-{environment}-{service}-{purpose}`

Examples:

- `forge-development-kms-general`
- `forge-development-sqs-imports`
- `forge-development-ecs-platform-api`

Global buckets: `forge-{environment}-{purpose}-{accountId}-{region}`

Rules: lowercase, no tenant/personnel names, deterministic, environment visible.
