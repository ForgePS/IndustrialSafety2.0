/**
 * One-off ECS diagnostic for forge_lookup_user_tenants (Sprint 1E).
 * Command: node /app/packages/database/dist/lookup-test-ecs.js
 */
import { LOCAL_PLACEHOLDER_ENV, loadEnvironmentAsync } from "@forge/environment";
import postgres from "postgres";

const USER_ID = process.env.LOOKUP_USER_ID ?? "019f9c33-288e-7171-8d94-b76c4a4658b6";

async function main(): Promise<void> {
  const env = await loadEnvironmentAsync({ ...LOCAL_PLACEHOLDER_ENV, ...process.env });
  const sql = postgres(env.DATABASE_URL, { max: 1 });
  try {
    const who = await sql`select current_user, session_user`;
    console.warn(JSON.stringify({ who }));
    const rows = await sql.unsafe(`select * from forge_lookup_user_tenants('${USER_ID}'::uuid)`);
    console.warn(JSON.stringify({ ok: true, count: rows.length, rows }));
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
