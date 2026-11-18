# Development deployment guide

1. Set `AWS_PROFILE` / credentials for the **development** account
2. Export `CDK_DEFAULT_ACCOUNT` and `CDK_DEFAULT_REGION` (e.g. `us-east-1`)
3. `pnpm --filter @forge/infrastructure-cdk validate`
4. `pnpm --filter @forge/infrastructure-cdk bootstrap` (once)
5. `pnpm --filter @forge/infrastructure-cdk synth`
6. `pnpm --filter @forge/infrastructure-cdk deploy`

Docker required for ECS image assets. Without Docker, synth still works; deploy of Compute fails at asset publish.

Destroy: `FORGE_CONFIRM_DESTROY=YES pnpm --filter @forge/infrastructure-cdk destroy`
