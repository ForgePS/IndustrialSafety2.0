# Forge Industrial Safety 2.0 - Local Development

Forge Industrial Safety 2.0 is designed to remain local during active development so hosted infrastructure is not required until the application is ready for production.

## Local stack

- Next.js 15
- pnpm + Turborepo
- Supabase CLI
- Local PostgreSQL
- Local Supabase Auth
- Local Supabase Storage
- Docker Desktop
- Private GitHub repository

## First-time setup

From the repository root:

```powershell
pnpm install
Copy-Item .\apps\web\.env.example .\apps\web\.env.local
pnpm web:supabase:start
pnpm web:supabase:status
```

Use the values shown by `supabase status` in `apps/web/.env.local`. Forge Industrial Safety 2.0 uses its own 3542x port range so it can coexist with the original local application.

At minimum, configure:

```env
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_APP_DOMAIN=localhost
NEXT_PUBLIC_APP_NAME=Forge Industrial Safety 2.0
NEXT_PUBLIC_APP_TITLE=%s | Forge Industrial Safety 2.0
NEXT_PUBLIC_APP_DESCRIPTION=Forge Industrial Safety 2.0 local development
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:35421
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_LOCAL_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_LOCAL_SERVICE_ROLE_KEY
SESSION_SECRET=USE_A_LONG_RANDOM_LOCAL_VALUE
NEXT_PUBLIC_I18N_COOKIE_NAME=lang
NEXT_PUBLIC_AUTH_PASSWORD=true
NEXT_PUBLIC_AUTH_MAGIC_LINK=false
```

Never create `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY`. The service-role key is server-only.

## Validate the machine

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\dev-doctor.ps1
```

## Reset the local database

The reset command rebuilds the local database from migrations and applies the local development seed.

```powershell
pnpm web:supabase:reset
```

The local seed intentionally contains no JetShip/ChatFlow marketing demo content.

Local development owner account:

- Email: `admin@forge2.local`
- Password: `ForgeDev2!`

This account is for local development only.

## Start the application

```powershell
pnpm dev
```

Open:

```text
http://localhost:3000
```

## Local Supabase Studio

Run:

```powershell
pnpm web:supabase:status
```

Use the Studio URL reported by the Supabase CLI. The Forge Industrial Safety 2.0 local Studio address is:

```text
http://127.0.0.1:35423
```

## Current 2.0 foundation

The 2.0 database foundation contains:

- organizations
- organization memberships
- divisions
- locations
- tenant-scoped Row Level Security helpers and policies

The local seed creates:

- Forge Industrial Safety 2.0 Demo organization
- Operations division
- Demo Location
- one local owner/admin account

This keeps all 2.0 development isolated from the original Forge Industrial Safety version.

## Normal daily workflow

```powershell
pnpm web:supabase:start
powershell -ExecutionPolicy Bypass -File .\scripts\dev-doctor.ps1
pnpm dev
```

When schema changes are made, create a new migration instead of editing production history.
