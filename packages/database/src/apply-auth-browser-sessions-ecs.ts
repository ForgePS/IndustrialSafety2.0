/**
 * Apply 0105 auth_browser_sessions DDL on Aurora without the full Drizzle chain.
 * Used when development ledger has historical gaps that block migrate.
 *
 * Invoked as: node /app/packages/database/dist/apply-auth-browser-sessions-ecs.js
 * Requires DATABASE_URL (via loadEnvironmentAsync + admin secret).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { LOCAL_PLACEHOLDER_ENV, loadEnvironmentAsync } from "@forge/environment";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sqlPath = path.join(__dirname, "..", "drizzle", "0105_auth_browser_sessions_s1.sql");

async function main(): Promise<void> {
  const env = await loadEnvironmentAsync({ ...LOCAL_PLACEHOLDER_ENV, ...process.env });
  const client = postgres(env.DATABASE_URL, { max: 1 });
  try {
    const sqlText = readFileSync(sqlPath, "utf8");
    await client.unsafe(sqlText);
    const rows = await client`
      SELECT to_regclass('public.auth_browser_sessions') AS table_name
    `;
    // eslint-disable-next-line no-console -- CLI output for ECS one-off
    console.info(
      JSON.stringify({
        status: "applied",
        migration: "0105_auth_browser_sessions_s1",
        table: rows[0]?.table_name ?? null,
      }),
    );
  } finally {
    await client.end({ timeout: 5 });
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
