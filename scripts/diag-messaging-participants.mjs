/**
 * Diagnose messaging participant create failures for producers-rice-mill.
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
      select id::text as id from tenants where tenant_key = ${TENANT_KEY} limit 1
    `;
    if (!tenant) throw new Error(`Tenant not found: ${TENANT_KEY}`);

    const memberships = await sql`
      select
        m.id::text as membership_id,
        m.user_id::text as user_id,
        m.status as membership_status,
        u.tenant_id::text as user_home_tenant_id,
        u.primary_email as email,
        u.status as user_status,
        (u.tenant_id = ${tenant.id}::uuid) as home_matches_active_tenant
      from user_tenant_memberships m
      join users u on u.id = m.user_id
      where m.tenant_id = ${tenant.id}::uuid
      order by m.status, u.primary_email
    `;

    const usersHomeOnly = await sql`
      select u.id::text as user_id, u.primary_email as email, u.status
      from users u
      where u.tenant_id = ${tenant.id}::uuid
        and not exists (
          select 1 from user_tenant_memberships m
          where m.user_id = u.id and m.tenant_id = ${tenant.id}::uuid and m.status = 'ACTIVE'
        )
      order by u.primary_email
    `;

    const activeMemberships = memberships.filter((m) => m.membership_status === "ACTIVE");
    const homeMismatch = activeMemberships.filter((m) => !m.home_matches_active_tenant);

    console.log(
      JSON.stringify(
        {
          tenantKey: TENANT_KEY,
          tenantId: tenant.id,
          membershipCounts: {
            total: memberships.length,
            active: activeMemberships.length,
            byStatus: memberships.reduce((acc, m) => {
              acc[m.membership_status] = (acc[m.membership_status] || 0) + 1;
              return acc;
            }, {}),
          },
          activeWithHomeTenantMismatch: homeMismatch.length,
          homeMismatchSample: homeMismatch.slice(0, 10).map((m) => ({
            email: m.email,
            userId: m.user_id,
            homeTenantId: m.user_home_tenant_id,
          })),
          usersWithHomeTenantButNoActiveMembership: usersHomeOnly.length,
          usersHomeOnlySample: usersHomeOnly.slice(0, 10),
          activeMembers: activeMemberships.map((m) => ({
            email: m.email,
            userId: m.user_id,
            membershipId: m.membership_id,
            homeMatches: m.home_matches_active_tenant,
            userStatus: m.user_status,
          })),
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
