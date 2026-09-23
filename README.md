# Forge Industrial Safety 2.0

This repository is the **Forge Industrial Safety 2.0** application.

- Product: Forge Industrial Safety 2.0
- Repository: `ForgePS/IndustrialSafety2.0`
- Workspace: `forge-industrial-safety-2.0`
- Application version: `2.0.0`

## Technology

Forge Industrial Safety 2.0 is built on Next.js, TypeScript, Tailwind CSS, Shadcn UI, Supabase, pnpm, and Turborepo.

## Upstream foundation

This application uses the licensed JetShip Next.js SaaS Starter Kit as its upstream foundation. The upstream repository should remain configured as a Git remote so future starter-kit updates can be reviewed and merged intentionally.

Do not publish or redistribute licensed upstream source contrary to the applicable JetShip/ThemeSelection license.

## Environment

Production secrets must be supplied through the deployment environment and must not be committed to this repository. In particular, the Supabase service-role key must remain server-only and use `SUPABASE_SERVICE_ROLE_KEY`, never a `NEXT_PUBLIC_` variable.

## Version separation

This codebase is specifically for **Forge Industrial Safety 2.0** and should remain separate from the original Forge Industrial Safety application.
