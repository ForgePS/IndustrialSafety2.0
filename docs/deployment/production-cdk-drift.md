# Production CDK drift: which stacks are safe to deploy

_Last reviewed: 2026-11-10_

Production releases are done by the scripts in `/scripts` (`deploy-production-*.mjs`,
`cf-*.mjs`, `cognito-*.mjs`, `bump-platform-api-memory.mjs`, and others). Those scripts change
AWS directly, so several CDK stacks no longer match what is running. A CDK deploy of a drifted
stack would **revert** script changes, or **fail** because of name collisions.

`bin/deploy-guard.ts` enforces the rules below for production. They don't apply to `diff` or `synth`.

## Rules

- `deploy --all` and wildcard selectors are refused.
- Name each stack explicitly and pass `--exclusively`, so CDK doesn't also deploy drifted
  dependency stacks.
- Only stacks in `PRODUCTION_CDK_SAFE_STACKS` are allowed.

```bash
FORGE_ENV=production FORGE_PRODUCTION_ACCOUNT=511343547817 FORGE_CONFIRM_PRODUCTION_DEPLOY=YES \
CDK_DEFAULT_ACCOUNT=511343547817 CDK_DEFAULT_REGION=us-east-1 \
pnpm run deploy deploy ForgeData --exclusively --require-approval never
```

Always run `cdk diff <Stack>` first and read it.

## Safe (deployed through CDK on 2026-11-10, or no drift seen)

| Stack | Notes |
|---|---|
| ForgeNetwork | Deployed 2026-11-10 (1 NAT gateway). |
| ForgeSecurity | Deployed 2026-11-10. |
| ForgeIdentity | Deployed 2026-11-10. Custom-message Lambda is `...-cognito-custom-message-cdk`. The hand-deployed one was deleted. |
| ForgeData | Deployed 2026-11-10 (min 1 ACU, no reader). |
| ForgeAlerting | No differences in the 2026-11-10 diff. |
| ForgeObservability | No differences in the 2026-11-10 diff. |

## Drifted (blocked)

| Stack | Known drift |
|---|---|
| ForgeCompute | API and worker task definitions are registered by scripts (API rev 484+, worker rev 14+). The live API uses secret `FORGE_AUTH_SESSION_ENCRYPTION_KEY`, **which CDK does not define**. Deploying would revert to CDK's task definitions and likely break sessions. The secret `forge-production-secrets-reporting-sweep-token` was created by hand. |
| ForgeMessaging | `forge-production-sqs-reporting-schedules`, its DLQ, and rule `forge-production-events-reporting-schedules` were created by hand, so the deploy fails on name collisions. |
| ForgeImportMalware | Role `forge-production-iam-guardduty-import-malware` and the GuardDuty malware protection plan on the imports bucket were created by hand (`scripts/bootstrap-production-import-malware.mjs`). |
| ForgeFrontend | CloudFront aliases, origins and functions are changed by `cf-*.mjs` scripts. The stack is in `UPDATE_ROLLBACK_COMPLETE` since 2026-09-23. |
| ForgeFieldFrontend, ForgeMonitoring, ForgeBackup, ForgeAudit | Not reviewed. Treat as drifted until a `cdk diff` is read. |

## Overriding (one stack, deliberately)

After reading `cdk diff <Stack>`, and only if the drift is understood:

```bash
FORGE_ALLOW_DRIFTED_STACK=ForgeMonitoring ... pnpm run deploy deploy ForgeMonitoring --exclusively
```

To make a stack permanently safe, reconcile it: bring the live settings into CDK, `cdk import`
or delete the hand-made resources, confirm the diff is clean, then add the stack to
`PRODUCTION_CDK_SAFE_STACKS` and move it to the Safe table above.
