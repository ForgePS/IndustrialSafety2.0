/**
 * READ-ONLY: check sessions_revoked_at and Cognito identity links for a tenant.
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
      select id::text as id, tenant_key, status from tenants where tenant_key = ${TENANT_KEY} limit 1
    `;
    if (!tenant) throw new Error("tenant missing");

    const members = await sql`
      select u.id::text as user_id, u.primary_email, u.status as user_status,
             u.sessions_revoked_at, u.session_version,
             m.id::text as membership_id, m.status as membership_status
      from user_tenant_memberships m
      join users u on u.id = m.user_id
      where m.tenant_id = ${tenant.id}::uuid
      order by u.primary_email
    `;

    const identities = await sql`
      select ai.user_id::text as user_id, ai.provider_subject, ai.email_at_link_time,
             ai.last_authenticated_at, u.primary_email
      from authentication_identities ai
      join users u on u.id = ai.user_id
      where ai.tenant_id = ${tenant.id}::uuid and ai.provider = 'COGNITO'
    `;

    const missingIdentity = members.filter(
      (m) => !identities.some((i) => i.user_id === m.user_id),
    );

    console.log(
      JSON.stringify(
        {
          ok: true,
          phase: "DIAG-TENANT-AUTH-HEALTH",
          tenant,
          memberCount: members.length,
          identityCount: identities.length,
          members,
          identities,
          missingIdentityEmails: missingIdentity.map((m) => m.primary_email),
          revokedRecently: members.filter((m) => m.sessions_revoked_at != null),
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
  console.error(JSON.stringify({ ok: false, error: String(err?.stack || err) }));
  process.exit(1);
});
