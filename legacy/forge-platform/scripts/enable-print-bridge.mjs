/**
 * Re-enable a disabled industrial printer bridge (admin DB one-off).
 * Usage (via run-ecs wrapper): TENANT_KEY=… BRIDGE_ID=… APPLY=1
 */
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const apiRequire = createRequire("/app/apps/platform-api/package.json");
const { SecretsManagerClient, GetSecretValueCommand } = apiRequire(
  "@aws-sdk/client-secrets-manager",
);
const dbRequire = createRequire("/app/apps/platform-api/node_modules/@forge/database/package.json");
const postgresMod = await import(pathToFileURL(dbRequire.resolve("postgres")).href);
const postgres = postgresMod.default ?? postgresMod;

const TENANT_KEY = process.env.TENANT_KEY?.trim() || "producers-rice-mill";
const BRIDGE_ID = process.env.BRIDGE_ID?.trim() || "";
const APPLY = process.env.APPLY === "1";

async function resolveDatabaseUrl(secretArn) {
  const region = process.env.AWS_REGION || "us-east-1";
  const client = new SecretsManagerClient({ region });
  const res = await client.send(new GetSecretValueCommand({ SecretId: secretArn }));
  const raw = JSON.parse(res.SecretString);
  const host = raw.host ?? raw.hostname;
  const dbname = raw.dbname ?? raw.database;
  const port = Number(raw.port ?? 5432);
  return `postgresql://${encodeURIComponent(raw.username)}:${encodeURIComponent(raw.password)}@${host}:${port}/${dbname}`;
}

async function main() {
  const adminArn = process.env.DATABASE_SECRET_ARN?.trim();
  if (!adminArn) throw new Error("DATABASE_SECRET_ARN required");
  const sql = postgres(await resolveDatabaseUrl(adminArn), { max: 1 });
  try {
    const [tenant] = await sql`
      select id::text as id, tenant_key from tenants where tenant_key = ${TENANT_KEY} limit 1
    `;
    if (!tenant) throw new Error(`Tenant not found: ${TENANT_KEY}`);

    const bridges = await sql`
      select id::text, name, status, enabled, registered_at, last_seen_at,
             (access_token_hash is not null) as has_token
      from industrial_printer_bridges
      where tenant_id = ${tenant.id}::uuid
        and (${BRIDGE_ID} = '' or id = ${BRIDGE_ID}::uuid)
      order by created_at desc
    `;

    if (!APPLY) {
      console.log(JSON.stringify({ dryRun: true, tenant, bridges }, null, 2));
      return;
    }

    const updated = await sql`
      update industrial_printer_bridges
      set enabled = true,
          status = 'OFFLINE',
          updated_at = now()
      where tenant_id = ${tenant.id}::uuid
        and (${BRIDGE_ID} = '' or id = ${BRIDGE_ID}::uuid)
        and (enabled = false or status = 'DISABLED')
      returning id::text, name, status, enabled, registered_at, last_seen_at,
                (access_token_hash is not null) as has_token
    `;

    console.log(
      JSON.stringify(
        {
          applied: true,
          tenant,
          before: bridges,
          after: updated,
          note: updated.some((b) => !b.has_token || !b.registered_at)
            ? "Bridge enabled but never registered — create a new pairing code on the Windows PC."
            : "Bridge enabled; waiting for heartbeat to go Online.",
        },
        null,
        2,
      ),
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
