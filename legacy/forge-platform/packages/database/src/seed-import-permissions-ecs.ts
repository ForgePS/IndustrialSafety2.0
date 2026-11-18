/**
 * Upsert platform seed (includes IMPORT_PERMISSIONS) via forge_admin.
 */
import { LOCAL_PLACEHOLDER_ENV, loadEnvironmentAsync } from "@forge/environment";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import path from "node:path";
import { pathToFileURL } from "node:url";
import postgres from "postgres";
import * as schema from "./schema.js";
import { seedPlatformData } from "./seed.js";

async function main(): Promise<void> {
  const env = await loadEnvironmentAsync({ ...LOCAL_PLACEHOLDER_ENV, ...process.env });
  const client = postgres(env.DATABASE_URL, { max: 1 });
  const db = drizzle(client, { schema });
  try {
    await seedPlatformData(db);
    const perms = [
      ...(await db.execute(
        sql`select code from permissions where code like 'import.%' order by 1`,
      )),
    ] as Array<{ code: string }>;
    // eslint-disable-next-line no-console -- CLI output for ECS seed task
    console.info(
      JSON.stringify({
        ok: true,
        importPermissionCount: perms.length,
        codes: perms.map((p) => p.code),
      }),
    );
    if (perms.length < 12) process.exitCode = 1;
  } finally {
    await client.end({ timeout: 5 });
  }
}

const isDirect =
  process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (
  isDirect ||
  process.argv[1]?.endsWith("seed-import-permissions-ecs.ts") ||
  process.argv[1]?.endsWith("seed-import-permissions-ecs.js")
) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
