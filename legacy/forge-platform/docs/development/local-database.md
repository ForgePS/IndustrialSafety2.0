# Local Database

Docker Compose runs PostgreSQL 16 with:

- User/password: `forge` / `forge_local_only` (local only)
- Databases: `forge_platform_local`, `forge_platform_test`
- Port: `5432`
- Named volume: `forge_pg_data`

Commands: `pnpm db:up`, `pnpm db:down`, `pnpm db:reset`, `pnpm db:logs`, `pnpm db:migrate`.
