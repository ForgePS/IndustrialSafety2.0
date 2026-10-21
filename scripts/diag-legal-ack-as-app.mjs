/**
 * Reproduce legal-ack requirement query as forge_app under tenant RLS.
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

const TENANT_ID = "019ff7d0-c20f-7659-81e4-c0cd68e23262";

async function secretUrl(secretId) {
  const region = process.env.AWS_REGION || "us-east-1";
  const client = new SecretsManagerClient({ region });
  const res = await client.send(new GetSecretValueCommand({ SecretId: secretId }));
  const raw = JSON.parse(res.SecretString);
  const host = raw.host ?? raw.hostname;
  const dbname = raw.dbname ?? raw.database;
  const port = Number(raw.port ?? 5432);
  return `postgresql://${encodeURIComponent(raw.username)}:${encodeURIComponent(raw.password)}@${host}:${port}/${dbname}`;
}

async function runAs(label, url) {
  const sql = postgres(url, { max: 1 });
  try {
    const who = await sql`select current_user as user, current_setting('app.current_tenant_id', true) as tenant`;
    let setTenant = null;
    try {
      await sql`select set_config('app.current_tenant_id', ${TENANT_ID}, true)`;
      setTenant = "ok";
    } catch (e) {
      setTenant = String(e?.message || e);
    }

    const cols = await sql`
      select column_name from information_schema.columns
      where table_name = 'legal_acknowledgment_requirements'
      order by ordinal_position
    `;

    let query = null;
    try {
      const rows = await sql`
        select lar.id, lar.user_scope, ld.document_key, ldv.version, ldv.status
        from legal_acknowledgment_requirements lar
        inner join legal_documents ld on ld.id = lar.document_id
        inner join legal_document_versions ldv on ldv.id = lar.document_version_id
        where lar.product = 'FORGE_INDUSTRIAL'
          and lar.required = true
          and (lar.tenant_id is null or lar.tenant_id = ${TENANT_ID}::uuid)
          and lar.required_from <= now()
          and (lar.required_until is null or lar.required_until > now())
          and ldv.status = 'ACTIVE'
          and ldv.effective_at <= now()
        limit 20
      `;
      query = { ok: true, count: rows.length, rows };
    } catch (e) {
      query = {
        ok: false,
        message: String(e?.message || e),
        code: e?.code,
        detail: e?.detail,
        hint: e?.hint,
        cause: e?.cause ? String(e.cause) : undefined,
      };
    }

    return { label, who, setTenant, columns: cols.map((c) => c.column_name), query };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function main() {
  const adminArn = process.env.DATABASE_SECRET_ARN?.trim();
  const appArn = process.env.DATABASE_APP_SECRET_ARN?.trim();
  if (!adminArn) throw new Error("DATABASE_SECRET_ARN required");

  const admin = await runAs("admin", await secretUrl(adminArn));
  const app = appArn ? await runAs("app", await secretUrl(appArn)) : { skipped: true };

  console.log(JSON.stringify({ admin, app }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
