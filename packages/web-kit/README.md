# @forge/web-kit

Shared browser utilities for Forge web applications: API client (envelope parsing, ETag, idempotency, auth headers), auth storage/provider, feature-flag helpers, and list-control utilities.

Extracted from `apps/creator-console` patterns for reuse in tenant-facing apps such as `apps/industrial-web`.

## Deferred migration

`apps/creator-console` is **not** refactored to use `@forge/web-kit` in NERIS Phase 2. Creator Console continues to use its local `src/lib/api.ts` and `src/lib/auth-storage.ts` copies until a later consolidation pass.

## Usage

```tsx
import { AuthProvider, useAuth, configureApiClient } from "@forge/web-kit";

configureApiClient({ baseUrl: process.env.NEXT_PUBLIC_API_URL });

export function App({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}
```

### Cognito Hosted UI (authorization code + PKCE)

Set `NEXT_PUBLIC_COGNITO_DOMAIN`, `NEXT_PUBLIC_COGNITO_CLIENT_ID`, `NEXT_PUBLIC_COGNITO_USER_POOL_ID`, and `NEXT_PUBLIC_APP_URL` at build time. Use `loginWithCognito()` from `useAuth()` to redirect to the Hosted UI and handle the callback at `/auth/callback/` with `exchangeCodeForTokens()`.

Local dev principal login is gated by `NEXT_PUBLIC_ALLOW_DEV_PRINCIPAL=true`.

Next.js apps should add `@forge/web-kit` to `transpilePackages` in `next.config.ts`.

## Build

```bash
pnpm --filter @forge/web-kit build
```
