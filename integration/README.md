# 2.0 → 1.0 integration

Every 2.0 change ships into 1.0's AWS as an update: a container image, translated migrations and this folder's `manifest.json`. The plan is in [docs/INTEGRATION_2X_INTO_1X_PLAN.md](../docs/INTEGRATION_2X_INTO_1X_PLAN.md).

## Adding something to 2.0 so it syncs into 1.0

- **Database.** Write migrations for Supabase as usual, with every new table, view, function, type and sequence prefixed with `public.`. Reference users only as `auth.users(id)` foreign keys and `auth.uid()`. Read names and emails from `public.users`. Don't use Storage policies, Supabase internal roles, pg_cron, pg_net, realtime, vault, new schemas, role changes, or extensions other than pgcrypto, vector and btree_gist.
- **Files.** Use `storage()` from `@/lib/platform/storage`. A new bucket needs an `insert into storage.buckets ... on conflict do nothing` migration plus an entry in the `StorageBucket` type.
- **Who is signed in.** Use `currentUser()` or `optionalUserId()` from `@/lib/platform/identity`, never `supabase.auth` or `getAuthUser`. Inside 1.0 they read 1.0's Cognito session (`FORGE_AUTH_PROVIDER=cognito`). To try that locally, run `node scripts/portability/dev-platform.cjs`, a stand-in for 1.0's sign-in that prints the env values to start 2.0 with. Sign-out buttons use `useSignOut` from `@/lib/platform/useSignOut`.
- **Hosting.** Don't depend on Vercel features. Scheduled work is a route with a bearer secret, listed in `scheduledJobs` in `scripts/portability/build-manifest.cjs`.
- **Registries.** New modules, permissions and menu entries go in `forge_feature_registry`, `forge_permission_registry` and `forge_experience_elements` (type `menu`) through migrations. Then run `node scripts/portability/build-manifest.cjs` and commit `integration/manifest.json`.

## Checks

| Command | What it checks | Needs a database |
|---|---|---|
| `node scripts/portability/check-portability.cjs` | The rules above, for new migrations and changed code | No |
| `node --test scripts/portability/sql.test.cjs` | The migration translator | No |
| `node scripts/portability/translate-migrations.cjs` | Writes the Aurora migration set to `integration/aurora/build/` | No |
| `node scripts/portability/rehearse-aurora.cjs` | Applies the shim and all translated migrations to a scratch database | Yes |
| `node scripts/portability/build-manifest.cjs --check` | `manifest.json` matches the migrations and routes | Yes |
| `node --experimental-strip-types --test apps/web/tests/platform-cognito.test.cjs` | Cognito token checks and the 1.0 session exchange, against the local stand-in | No |

All six run in CI. When you remove a direct Supabase use, run `check-portability.cjs --update` to lock the smaller baseline in.
