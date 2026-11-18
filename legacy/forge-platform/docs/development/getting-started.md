# Getting Started

1. Install Node 20+ and enable Corepack: `corepack enable`
2. `corepack prepare pnpm@10.12.1 --activate`
3. `pnpm install`
4. Copy `.env.local.example` to `.env.local`
5. For Field (`apps/field-web`), also copy `apps/field-web/.env.local.example` → `apps/field-web/.env.local` (Cognito `NEXT_PUBLIC_*` values)
6. Start Postgres: `pnpm db:up`
7. Migrate: `pnpm db:migrate`
8. Run apps: `pnpm --filter @forge/platform-api dev` (and web apps as needed; Field is `pnpm --filter @forge/field-web dev` on port 3005)

Never use real personnel data locally.
