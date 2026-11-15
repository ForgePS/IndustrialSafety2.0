# Database Migrations

- ORM: Drizzle
- Migrations live in `packages/database/drizzle`
- Apply: `pnpm db:migrate`
- Status: `pnpm db:migrate:status`
- Generate: `pnpm db:generate`

Do not use destructive reset against staging/production. Sprint 1B only includes foundational `tenants` and `users` tables.
