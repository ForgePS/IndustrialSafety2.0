/**
 * Apply only MK-S6 facility_ids_json columns (0029) — safe additive.
 * APPLY=1 to execute.
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
  const before = await sql`
    select table_name, column_name
    from information_schema.columns
    where table_name in ('user_tenant_memberships', 'user_invitations', 'users')
      and column_name = 'facility_ids_json'
    order by table_name
  `;

  const actions = [];
  if (APPLY) {
    await sql.unsafe(`
      ALTER TABLE "user_invitations"
        ADD COLUMN IF NOT EXISTS "facility_ids_json" jsonb NOT NULL DEFAULT '[]'::jsonb;
      ALTER TABLE "user_tenant_memberships"
        ADD COLUMN IF NOT EXISTS "facility_ids_json" jsonb NOT NULL DEFAULT '[]'::jsonb;
    `);
    actions.push("applied_0029_facility_ids_json");
  } else {
    actions.push("dry_run");
  }

  const after = await sql`
    select table_name, column_name
    from information_schema.columns
    where table_name in ('user_tenant_memberships', 'user_invitations', 'users')
      and column_name = 'facility_ids_json'
    order by table_name
  `;

  console.log(
    JSON.stringify(
      { ok: true, phase: "APPLY-0029-FACILITY-IDS", apply: APPLY, before, actions, after },
      null,
      2,
    ),
  );
} finally {
  await sql.end({ timeout: 5 });
}
