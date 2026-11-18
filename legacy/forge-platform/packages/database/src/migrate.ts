import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const connectionString =
  process.env.DATABASE_URL ??
  "postgresql://forge:forge_local_only@localhost:5432/forge_platform_local";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.join(__dirname, "..", "drizzle");

async function main(): Promise<void> {
  const client = postgres(connectionString, { max: 1 });
  const db = drizzle(client);
  await migrate(db, { migrationsFolder });
  // eslint-disable-next-line no-console
  console.info(
    JSON.stringify({ status: "migrated", databaseUrlHost: new URL(connectionString).host }),
  );
  await client.end({ timeout: 5 });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
