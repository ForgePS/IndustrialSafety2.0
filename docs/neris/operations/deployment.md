# NERIS Phase 2 — Deployment and Hosting

Static SPAs are deployed separately from the API ECS service so UI releases do not recycle API tasks.

## Infrastructure

| App             | CDK construct                                | Config flag                     | Bucket pattern                           |
| --------------- | -------------------------------------------- | ------------------------------- | ---------------------------------------- |
| Creator Console | `ForgeConsoleHosting` → `ForgeStaticHosting` | `features.enableConsoleHosting` | `forge-{env}-console-{account}-{region}` |
| RMS Web         | `ForgeRmsHosting` → `ForgeStaticHosting`     | `features.enableRmsHosting`     | `forge-{env}-rms-{account}-{region}`     |

Both use private S3 + CloudFront OAC, secure response headers, and SPA 403/404 → `/index.html` rewrites ([ADR-026](../../decisions/ADR-026-creator-console-hosting.md) pattern).

Stack: `ForgeFrontend` (`infrastructure/cdk/lib/stacks/frontend-stack.ts`).

CloudFormation exports (when enabled):

| Export                                | Purpose                   |
| ------------------------------------- | ------------------------- |
| `ForgeFrontend-ConsoleDomain`         | Console CloudFront domain |
| `ForgeFrontend-ConsoleBucket`         | Console S3 bucket         |
| `ForgeFrontend-ConsoleDistributionId` | Cache invalidation        |
| `ForgeFrontend-RmsDomain`             | RMS CloudFront domain     |
| `ForgeFrontend-RmsBucket`             | RMS S3 bucket             |
| `ForgeFrontend-RmsDistributionId`     | Cache invalidation        |

## Deploy sequence (development)

1. `pnpm infra:synth` / `pnpm infra:deploy` — provisions or updates buckets and distributions (Wave 8 IaC only until deploy step runs).
2. `pnpm deploy:rms-web` — resolves CloudFormation exports, builds `@forge/rms-web` with Cognito/API env vars, syncs `apps/rms-web/out/` to S3, and invalidates CloudFront.
3. Creator Console: `pnpm deploy:console`.

### RMS build environment

`scripts/sync-static-site.mjs --app rms` passes these into the Next static export (unless already set in the shell):

| Build env                          | Source export / fallback                                               |
| ---------------------------------- | ---------------------------------------------------------------------- |
| `NEXT_PUBLIC_API_URL`              | `ForgeCompute-ApiHttpsDomain` → `https://{domain}`                     |
| `NEXT_PUBLIC_APP_URL`              | `ForgeFrontend-RmsDomain` → `https://{domain}`                         |
| `NEXT_PUBLIC_COGNITO_USER_POOL_ID` | `ForgeIdentity-UserPoolId`                                             |
| `NEXT_PUBLIC_COGNITO_CLIENT_ID`    | `ForgeIdentity-RmsClientId` (planned) or `FORGE_RMS_COGNITO_CLIENT_ID` |
| `NEXT_PUBLIC_COGNITO_DOMAIN`       | `ForgeIdentity-CognitoDomain` (planned) or `FORGE_COGNITO_DOMAIN`      |

Deployed builds must **not** set `NEXT_PUBLIC_ALLOW_DEV_PRINCIPAL`. Local dev may set `NEXT_PUBLIC_ALLOW_DEV_PRINCIPAL=true` plus optional `NEXT_PUBLIC_DEV_PRINCIPAL` for the dev-principal form.

Local-only build example:

```bash
NEXT_PUBLIC_ALLOW_DEV_PRINCIPAL=true \
NEXT_PUBLIC_API_URL=http://localhost:4000 \
pnpm --filter @forge/rms-web build
```

Override bucket/distribution without CloudFormation lookups:

```bash
export FORGE_RMS_BUCKET=forge-development-rms-511343547817-us-east-1
export FORGE_RMS_DISTRIBUTION_ID=E1234567890ABC
pnpm deploy:rms-web -- --skip-build
```

## Database migrations

Apply before first incident create:

```bash
pnpm db:migrate
# or ECS one-off for Aurora — see docs/operations/database-migration-runbook.md
```

Migrations: `0009_rms_master_data`, `0010_neris_incident_shell`.

## HTTPS / custom domains

Edge TLS remains gated by `edge.enableHttps` ([ADR-025](../../decisions/ADR-025-edge-tls-and-dns.md)). Development uses CloudFront default domains until DNS is delegated. Planned hostnames: `domains.rms`, `domains.creator` in environment config.

## Cost

Each static frontend adds roughly $1/month (CloudFront + S3) per [development cost control](../../operations/development-cost-control.md).

## Not in Phase 2 deploy scope

- CAD integration endpoints
- External NERIS submission pipelines
- Creator Console → `@forge/web-kit` refactor
