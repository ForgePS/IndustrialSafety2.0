#!/usr/bin/env node
/**
 * Set executive walkthrough narration voice for a tenant (runs in platform-api ECS).
 *
 *   VOICE_ID=Stephen TENANT_KEY=producers-rice-mill APPLY=1 node scripts/set-walkthrough-voice.mjs
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

const TENANT_KEY = (process.env.TENANT_KEY || "producers-rice-mill").trim();
const VOICE_ID = (process.env.VOICE_ID || "Stephen").trim();
const APPLY = process.env.APPLY === "1" || process.env.APPLY === "true";

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

const adminArn = process.env.DATABASE_SECRET_ARN?.trim();
if (!adminArn) throw new Error("DATABASE_SECRET_ARN required");
const sql = postgres(await resolveDatabaseUrl(adminArn), { max: 1 });

try {
  const tenants = await sql`
    select id::text as id, tenant_key
    from tenants
    where tenant_key = ${TENANT_KEY}
    limit 1
  `;
  if (!tenants.length) {
    console.error(JSON.stringify({ ok: false, error: "tenant_not_found", TENANT_KEY }));
    process.exit(1);
  }
  const tenant = tenants[0];
  const before = await sql`
    select id::text as id, voice_id, updated_at
    from industrial_executive_walkthrough_settings
    where tenant_id = ${tenant.id}::uuid
    limit 1
  `;
  console.log(
    JSON.stringify({
      ok: true,
      apply: APPLY,
      tenant: { id: tenant.id, key: tenant.tenant_key },
      voiceId: VOICE_ID,
      before: before[0] ?? null,
    }),
  );
  if (!APPLY) process.exit(0);
  if (!before.length) {
    console.error(JSON.stringify({ ok: false, error: "settings_row_missing" }));
    process.exit(1);
  }
  const updated = await sql`
    update industrial_executive_walkthrough_settings
    set voice_id = ${VOICE_ID}, updated_at = now()
    where tenant_id = ${tenant.id}::uuid
    returning id::text as id, voice_id, updated_at
  `;
  console.log(JSON.stringify({ ok: true, after: updated[0] }));
} finally {
  await sql.end({ timeout: 5 });
}
