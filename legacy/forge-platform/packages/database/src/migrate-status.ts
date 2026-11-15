import postgres from "postgres";

const connectionString =
  process.env.DATABASE_URL ??
  "postgresql://forge:forge_local_only@localhost:5432/forge_platform_local";

async function main(): Promise<void> {
  const client = postgres(connectionString, { max: 1 });
  try {
    const rows = await client`
      select id, hash, created_at
      from drizzle.__drizzle_migrations
      order by created_at asc
    `.catch(async () => {
      return [] as { id: number; hash: string; created_at: string }[];
    });
    // eslint-disable-next-line no-console
    console.info(JSON.stringify({ migrations: rows }, null, 2));
  } finally {
    await client.end({ timeout: 5 });
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
