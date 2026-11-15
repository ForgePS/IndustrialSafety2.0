/**
 * Apply EXECUTE grants for identity lookup functions (0006 hotfix).
 * Command: node /app/packages/database/dist/grant-lookup-ecs.js
 */
import { LOCAL_PLACEHOLDER_ENV, loadEnvironmentAsync } from "@forge/environment";
import postgres from "postgres";

async function main(): Promise<void> {
  const env = await loadEnvironmentAsync({ ...LOCAL_PLACEHOLDER_ENV, ...process.env });
  const sql = postgres(env.DATABASE_URL, { max: 1 });
  try {
    await sql.unsafe(`
DO $$
DECLARE
  f text;
  r text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'forge_lookup_identity(text, text)',
    'forge_lookup_invitation(text)',
    'forge_lookup_user_tenants(uuid)'
  ]
  LOOP
    FOREACH r IN ARRAY ARRAY['forge_app', 'forge_admin']
    LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %I', f, r);
      END IF;
    END LOOP;
  END LOOP;
END
$$;
`);
    const rows = await sql.unsafe(
      `select * from forge_lookup_user_tenants('019f9c33-288e-7171-8d94-b76c4a4658b6'::uuid)`,
    );
    console.warn(JSON.stringify({ ok: true, granted: true, lookupCount: rows.length, rows }));
  } catch (error: unknown) {
    console.error(
      JSON.stringify({
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      }),
    );
    process.exitCode = 1;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
