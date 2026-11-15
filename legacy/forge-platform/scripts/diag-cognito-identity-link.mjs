/**
 * READ-ONLY: verify Cognito identity linkage for a user email or subject.
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

const TARGET_EMAIL = (process.env.TARGET_EMAIL || "").trim().toLowerCase();
const COGNITO_SUB = (process.env.COGNITO_SUB || "").trim();

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
    const report = { targetEmail: TARGET_EMAIL || null, cognitoSub: COGNITO_SUB || null };

    if (TARGET_EMAIL) {
      report.users = await sql`
        select id::text as id, tenant_id::text as tenant_id, primary_email, status, person_id::text as person_id
        from users where lower(primary_email) = ${TARGET_EMAIL}
      `;
      for (const u of report.users ?? []) {
        u.identities = await sql`
          select id::text as id, provider, provider_subject, email_at_link_time,
                 last_authenticated_at, tenant_id::text as tenant_id
          from authentication_identities
          where user_id = ${u.id}::uuid
        `;
        u.memberships = await sql`
          select m.id::text as membership_id, t.tenant_key, m.status, m.is_default_tenant
          from user_tenant_memberships m
          join tenants t on t.id = m.tenant_id
          where m.user_id = ${u.id}::uuid
        `;
        u.lookupByIdentity = [];
        for (const ident of u.identities ?? []) {
          const rows = await sql`
            select * from forge_lookup_identity('COGNITO', ${ident.provider_subject})
          `;
          u.lookupByIdentity.push({ subject: ident.provider_subject, rows });
        }
      }
    }

    if (COGNITO_SUB) {
      report.bySubject = await sql`
        select ai.id::text as id, ai.user_id::text as user_id, ai.tenant_id::text as tenant_id,
               ai.provider_subject, ai.email_at_link_time, u.primary_email, u.status as user_status
        from authentication_identities ai
        join users u on u.id = ai.user_id
        where ai.provider = 'COGNITO' and ai.provider_subject = ${COGNITO_SUB}
      `;
      report.lookupIdentity = await sql`
        select * from forge_lookup_identity('COGNITO', ${COGNITO_SUB})
      `;
    }

    console.log(JSON.stringify({ ok: true, phase: "DIAG-COGNITO-IDENTITY-LINK", report }, null, 2));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: String(err?.stack || err) }));
  process.exit(1);
});
