# ADR-011: Runtime database secret resolution

**Status:** Accepted  
**Date:** 2026-07-25  
**Sprint:** 1C Deployment Completion

## Context

ECS tasks must connect to Aurora without embedding a password in plaintext task-definition environment variables. Sprint 1C deployment completion requires `/ready` to resolve database connectivity through Secrets Manager.

## Decision

**Option B — Secret JSON retrieval at startup.**

1. ECS injects only `DATABASE_SECRET_ARN` (ARN string) as an environment variable.
2. At application bootstrap, `platform-api` and `worker-service` use the AWS SDK Secrets Manager client to `GetSecretValue` for that ARN.
3. The RDS-managed secret JSON (`host`, `port`, `dbname`/`database`, `username`, `password`) is used to construct `DATABASE_URL` and related fields in memory.
4. The ECS task role already has `secretsmanager:GetSecretValue` on the database secret only.

## Consequences

- No password in CloudFormation outputs or plaintext ECS env.
- Cold start adds one Secrets Manager call.
- Local development continues to use `LOCAL_PLACEHOLDER_ENV` / `.env` without calling AWS when `DATABASE_SECRET_ARN` is empty.
- Rotation later requires process restart or refresh hook (tracked as TD-24).
