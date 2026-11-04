# Forge Platform

Secure multi-tenant AWS platform for Forge Industrial Safety and Forge Academy. (Forge Responder / RMS lives in its own Firebase repo.)

> **Security:** Never commit real personnel data, SSNs, FEMA SIDs, production exports, or AWS credentials into this repository. Local/dev environments must use synthetic data only.

## Status

Sprint **1B (Monorepo and Development Architecture Foundation)** — see [docs/project-status.md](docs/project-status.md).

Legacy Firebase apps remain operational in separate repositories. They are **not** copied wholesale into this monorepo.

## Required tools

- Node.js 20+
- pnpm `10.12.1` (via Corepack)
- Docker Desktop (local PostgreSQL)

## Repository structure

- `apps/` — application shells (academy-web, industrial-web, creator-console, platform-api, worker-service + placeholders)
- `packages/` — shared libraries (`@forge/*`)
- `infrastructure/cdk/` — CDK placeholder (Sprint 1C)
- `database/` — docker init, future migrations docs
- `migration/` — Firebase migration tooling placeholders
- `docs/` — architecture, decisions, discovery, development, sprints

## Local setup

```powershell
corepack enable
corepack prepare pnpm@10.12.1 --activate
pnpm install
copy .env.local.example .env.local
pnpm db:up
pnpm db:migrate
```

## Common commands

| Command                             | Purpose                      |
| ----------------------------------- | ---------------------------- |
| `pnpm dev`                          | Start workspace apps (turbo) |
| `pnpm build`                        | Build all packages/apps      |
| `pnpm lint`                         | ESLint                       |
| `pnpm typecheck`                    | TypeScript                   |
| `pnpm test`                         | Unit/integration tests       |
| `pnpm format` / `pnpm format:check` | Prettier                     |
| `pnpm db:up` / `pnpm db:down`       | Local Postgres               |
| `pnpm db:migrate`                   | Apply Drizzle migrations     |

## Application ports (local)

| App             | Port |
| --------------- | ---- |
| academy-web     | 3001 |
| creator-console | 3003 |
| platform-api    | 4000 |

## Documentation

- [Getting started](docs/development/getting-started.md)
- [Environment variables](docs/development/environment-variables.md)
- [Local database](docs/development/local-database.md)
- [ADRs](docs/decisions/)
- [Discovery (Sprint 1A)](docs/discovery/)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).
