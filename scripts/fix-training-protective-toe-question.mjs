/**
 * Fix mojibake in training question text: protective?Toe -> Protective Toe
 *
 *   TENANT_KEY=producers-rice-mill node scripts/fix-training-protective-toe-question.mjs
 *   TENANT_KEY=producers-rice-mill APPLY=1 node scripts/fix-training-protective-toe-question.mjs
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
const APPLY = process.env.APPLY === "1" || process.env.APPLY === "true";
const ALLOWED = new Set(["producers-rice-mill"]);

if (!ALLOWED.has(TENANT_KEY)) {
  throw new Error(`Refusing tenant ${TENANT_KEY}; allowed: ${[...ALLOWED].join(", ")}`);
}

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

function fixText(value) {
  if (typeof value !== "string" || !value.includes("?")) return value;
  return value.replace(/protective\s*\?\s*Toe/gi, "Protective Toe");
}

function fixChoices(raw) {
  if (!Array.isArray(raw)) return raw;
  let changed = false;
  const next = raw.map((choice) => {
    const fixed = fixText(String(choice ?? ""));
    if (fixed !== choice) changed = true;
    return fixed;
  });
  return changed ? next : raw;
}

const secretArn = process.env.DATABASE_SECRET_ARN;
if (!secretArn) throw new Error("DATABASE_SECRET_ARN is required");
const sql = postgres(await resolveDatabaseUrl(secretArn), { max: 1 });

const tenantRows = await sql`
  select id::text as tenant_id
  from tenants
  where tenant_key = ${TENANT_KEY}
  limit 1
`;
const tenantId = tenantRows[0]?.tenant_id;
if (!tenantId) throw new Error(`Tenant not found: ${TENANT_KEY}`);

const rows = await sql`
  select id::text as id, stem, choices
  from industrial_training_questions
  where tenant_id = ${tenantId}::uuid
    and archived_at is null
    and (
      stem ~* 'protective\\s*\\?\\s*Toe'
      or choices::text ~* 'protective\\s*\\?\\s*Toe'
    )
`;

const updates = [];
for (const row of rows) {
  const stem = fixText(row.stem);
  const choices = fixChoices(row.choices);
  if (stem === row.stem && choices === row.choices) continue;
  updates.push({ id: row.id, stem, choices });
}

console.log(JSON.stringify({ tenantKey: TENANT_KEY, matched: rows.length, toUpdate: updates.length, apply: APPLY }, null, 2));
for (const row of updates) {
  console.log(`- ${row.id}: ${row.stem.slice(0, 120)}`);
}

if (APPLY && updates.length) {
  for (const row of updates) {
    await sql`
      update industrial_training_questions
      set stem = ${row.stem},
          choices = ${sql.json(row.choices)},
          updated_at = now()
      where id = ${row.id}::uuid
        and tenant_id = ${tenantId}::uuid
    `;
  }
}

await sql.end();
console.log(APPLY ? "Applied." : "Dry run only. Set APPLY=1 to update.");
