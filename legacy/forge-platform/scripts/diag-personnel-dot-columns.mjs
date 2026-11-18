/**
 * Verify industrial_personnel columns required by current API schema.
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
    const needed = [
      "is_company_driver",
      "is_dot_driver",
      "cpr_certification_document_id",
      "first_aid_certification_document_id",
    ];
    const cols = await sql`
      select column_name
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'industrial_personnel'
        and column_name = any(${needed})
      order by column_name
    `;
    const present = new Set(cols.map((c) => c.column_name));
    const missing = needed.filter((c) => !present.has(c));

    // Smoke-test the exact full-row shape the API uses for DOT file enrichment.
    const smoke = await sql`
      select id, is_dot_driver, cpr_certification_document_id, first_aid_certification_document_id
      from industrial_personnel
      where archived_at is null
      limit 1
    `;

    const [dotCount] = await sql`
      select count(*)::int as n
      from industrial_dot_compliance_records
      where archived_at is null
    `;

    // Prove a full-row select works (same shape as API enrichDotListItem).
    await sql`select * from industrial_personnel where archived_at is null limit 1`;

    console.log(
      JSON.stringify(
        {
          missing,
          present: [...present],
          smokeOk: true,
          sample: smoke[0] ?? null,
          dotRecords: dotCount?.n ?? null,
        },
        null,
        2,
      ),
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
